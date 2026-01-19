'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Note, NoteVersion, NoteCreateData, NoteUpdateData } from '@/lib/types'
import { UnauthorizedError, NotFoundError, handleServerActionError } from '@/lib/errors'
import { extractAllUrls } from '@/lib/media-utils'
import { processNoteLinks } from '@/lib/link-metadata'

// ページネーション結果の型
export interface NotesPageResult {
  notes: Note[]
  nextCursor: string | null
  hasMore: boolean
}

const DEFAULT_PAGE_SIZE = 20

// バージョン管理設定
const VERSION_INTERVAL_MS = 30 * 60 * 1000; // 30分（ms）
const MAX_VERSIONS_PER_NOTE = 20; // 1ノートあたりの最大履歴数

// Helper: コンテンツからタグを抽出（#で始まる単語）
function extractTagsFromContent(content: string): string {
  const tagRegex = /#([^\s#]+)/g
  const matches = content.match(tagRegex)
  if (!matches) return '[]'
  const tags = [...new Set(matches.map(t => t.slice(1)))]
  return JSON.stringify(tags)
}

// Helper: Parse JSON fields
function parseNote(dbNote: any): Note {
  return {
    id: dbNote.id,
    title: dbNote.title,
    content: dbNote.content,
    isPinned: dbNote.isPinned,
    isArchived: dbNote.isArchived,
    tags: JSON.parse(dbNote.tags || '[]'),
    images: JSON.parse(dbNote.images || '[]'),
    createdAt: dbNote.createdAt,
    updatedAt: dbNote.updatedAt,
  }
}

/**
 * ノートをページネーションで取得（Client Component 用 Server Action）
 * @param cursor - 前回の最後のノートID（初回はnull）
 * @param limit - 取得件数（デフォルト20）
 * @param tag - タグでフィルタ（オプション）
 * @param search - 検索クエリ（オプション）
 * @param includeArchived - アーカイブ済みを含める（デフォルトfalse）
 * @param excludePinned - ピン留めを除外する（デフォルトfalse）
 * @param sortOrder - ソート順（'desc' | 'asc'、デフォルト'desc'）
 */
export async function fetchNotesPage(
  cursor: string | null = null,
  limit: number = DEFAULT_PAGE_SIZE,
  tag?: string,
  search?: string,
  includeArchived: boolean = false,
  excludePinned: boolean = false,
  sortOrder: 'desc' | 'asc' = 'desc'
): Promise<NotesPageResult> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    // 1件多く取得して hasMore を判定
    const take = limit + 1

    // フィルタ条件を構築
    const where: any = {}
    
    // アーカイブフィルタ（デフォルトでアーカイブを除外）
    if (!includeArchived) {
      where.isArchived = false
    }
    
    // ピン留め除外フィルタ
    if (excludePinned) {
      where.isPinned = false
    }
    
    if (tag) {
      if (tag === '__untagged__') {
        // タグなしのノート: tags が空配列 "[]" のもの
        where.tags = { equals: '[]' }
      } else {
        where.tags = { contains: `"${tag}"` }
      }
    }
    
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ]
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: sortOrder },
      take,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    })

    const hasMore = notes.length > limit
    const resultNotes = hasMore ? notes.slice(0, limit) : notes
    const nextCursor = hasMore ? resultNotes[resultNotes.length - 1]?.id : null

    return {
      notes: resultNotes.map(parseNote),
      nextCursor,
      hasMore,
    }
  } catch (error) {
    console.error('fetchNotesPage error:', handleServerActionError(error))
    throw error
  }
}

/**
 * 全ノート取得（Client Component 用 Server Action）
 * Server Components は lib/queries.ts の getNotes を使用すること（cache適用）
 * @param includeArchived - アーカイブ済みを含める（デフォルトfalse）
 */
export async function fetchNotes(includeArchived: boolean = false): Promise<Note[]> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const where: any = {}
    if (!includeArchived) {
      where.isArchived = false
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    })

    return notes.map(parseNote)
  } catch (error) {
    console.error('fetchNotes error:', handleServerActionError(error))
    throw error
  }
}

/**
 * 個別ノート取得（Client Component 用 Server Action）
 * Server Components は lib/queries.ts の getNote を使用すること（cache適用）
 */
export async function fetchNote(id: string): Promise<Note | null> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const note = await prisma.note.findUnique({
      where: { id },
    })

    if (!note) return null
    return parseNote(note)
  } catch (error) {
    console.error('fetchNote error:', handleServerActionError(error))
    throw error
  }
}

/**
 * タイトル変更時に他ノートのWikiLinkを更新
 * @param noteId - 変更されたノートのID
 * @param oldTitle - 変更前のタイトル
 * @param newTitle - 変更後のタイトル
 * @returns 更新されたノートの数
 */
async function updateWikiLinksOnTitleChange(
  noteId: string,
  oldTitle: string,
  newTitle: string
): Promise<number> {
  // 空タイトルや同じタイトルの場合はスキップ
  if (!oldTitle.trim() || !newTitle.trim() || oldTitle === newTitle) {
    return 0
  }

  // 1. [[旧タイトル を含むノートをSQL検索（予備フィルタ）
  const potentialNotes = await prisma.note.findMany({
    where: {
      id: { not: noteId },
      content: { contains: `[[${oldTitle}` },
    },
    select: { id: true, content: true },
  })

  if (potentialNotes.length === 0) return 0

  // 2. 正規表現で厳密マッチ＆置換
  const escapedTitle = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\[\\[${escapedTitle}(\\|[^\\]]+)?\\]\\]`, 'g')

  const updates: { id: string; content: string }[] = []
  for (const note of potentialNotes) {
    if (regex.test(note.content)) {
      regex.lastIndex = 0
      const newContent = note.content.replace(regex, (_: string, alias: string | undefined) =>
        alias ? `[[${newTitle}${alias}]]` : `[[${newTitle}]]`
      )
      if (newContent !== note.content) {
        updates.push({ id: note.id, content: newContent })
      }
    }
  }

  if (updates.length === 0) return 0

  // 3. トランザクションで一括更新
  await prisma.$transaction(
    updates.map(u => prisma.note.update({
      where: { id: u.id },
      data: { content: u.content },
    }))
  )

  return updates.length
}

export async function saveNote(id: string | null, data: NoteCreateData | NoteUpdateData): Promise<Note> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    // 既存ノートの場合、現在の値を取得して保持
    let existingNote: any = null
    if (id) {
      existingNote = await prisma.note.findUnique({ where: { id } })
    }

    const noteData = {
      title: data.title || '無題のメモ',
      content: data.content || '',
      // 明示的に指定されていない場合は既存の値を保持、なければデフォルト値
      isPinned: data.isPinned !== undefined ? data.isPinned : (existingNote?.isPinned ?? false),
      isArchived: ('isArchived' in data && data.isArchived !== undefined) ? data.isArchived : (existingNote?.isArchived ?? false),
      tags: JSON.stringify(data.tags || []),
      images: data.images !== undefined ? JSON.stringify(data.images) : (existingNote?.images ?? '[]'),
    }

    let note
    if (id) {
      // 既存ノートの更新時：バージョン管理を適用
      // existingNote は上で既に取得済み
      const currentNote = existingNote
      
      if (currentNote) {
        // 最新のバージョンを取得
        const lastVersion = await prisma.noteVersion.findFirst({
          where: { noteId: id },
          orderBy: { createdAt: 'desc' },
        })
        
        const now = new Date()
        const shouldCreateVersion = 
          !lastVersion || 
          (now.getTime() - lastVersion.createdAt.getTime() > VERSION_INTERVAL_MS)
        
        // 一定時間経過していたら、現在の状態をバージョンとして保存
        if (shouldCreateVersion && (currentNote.title || currentNote.content)) {
          await prisma.noteVersion.create({
            data: {
              noteId: id,
              title: currentNote.title,
              content: currentNote.content,
              tags: currentNote.tags, // tagsも保存
            }
          })
          
          // 古いバージョンのクリーンアップ
          const versionCount = await prisma.noteVersion.count({
            where: { noteId: id }
          })
          
          if (versionCount > MAX_VERSIONS_PER_NOTE) {
            // 最も古いバージョンを削除
            const oldestVersion = await prisma.noteVersion.findFirst({
              where: { noteId: id },
              orderBy: { createdAt: 'asc' },
            })
            if (oldestVersion) {
              await prisma.noteVersion.delete({
                where: { id: oldestVersion.id }
              })
            }
          }
        }
      }
      
      // Update existing note
      note = await prisma.note.update({
        where: { id },
        data: noteData,
      })

      // タイトル変更時のWikiLink更新
      const oldTitle = existingNote?.title
      const newTitle = noteData.title
      if (oldTitle && newTitle && oldTitle !== newTitle) {
        try {
          const updatedCount = await updateWikiLinksOnTitleChange(id, oldTitle, newTitle)
          if (updatedCount > 0) {
            console.log(`WikiLinks updated in ${updatedCount} notes`)
          }
        } catch (err) {
          console.error('WikiLink update failed:', err)
          // WikiLink更新失敗はエラーとしない（メインの保存は成功）
        }
      }
    } else {
      // Create new note
      note = await prisma.note.create({
        data: noteData,
      })
    }

    revalidatePath('/')
    revalidatePath(`/notes/${note.id}`)

    // URLを抽出してLinkMetadataを処理（非同期、待機しない）
    const urls = extractAllUrls(noteData.content)
    if (urls.length > 0) {
      processNoteLinks(note.id, urls).catch((err) => {
        console.error('processNoteLinks error:', err)
      })
    }

    return parseNote(note)
  } catch (error) {
    console.error('saveNote error:', handleServerActionError(error))
    throw error
  }
}

export async function deleteNote(id: string): Promise<void> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    await prisma.note.delete({
      where: { id },
    })

    revalidatePath('/')
  } catch (error) {
    console.error('deleteNote error:', handleServerActionError(error))
    throw error
  }
}

export async function togglePin(id: string): Promise<Note> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const note = await prisma.note.findUnique({ where: { id } })
    if (!note) throw new NotFoundError('Note not found')

    const updated = await prisma.note.update({
      where: { id },
      data: { isPinned: !note.isPinned },
    })

    revalidatePath('/')
    return parseNote(updated)
  } catch (error) {
    console.error('togglePin error:', handleServerActionError(error))
    throw error
  }
}

export async function toggleArchive(id: string): Promise<Note> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const note = await prisma.note.findUnique({ where: { id } })
    if (!note) throw new NotFoundError('Note not found')

    const updated = await prisma.note.update({
      where: { id },
      data: { 
        isArchived: !note.isArchived,
        // アーカイブ時はピン留めを解除
        ...(note.isArchived === false && { isPinned: false }),
      },
    })

    revalidatePath('/')
    return parseNote(updated)
  } catch (error) {
    console.error('toggleArchive error:', handleServerActionError(error))
    throw error
  }
}

// ========== バージョン管理関連 ==========

/**
 * ノートのバージョン履歴を取得
 */
export async function fetchNoteVersions(noteId: string): Promise<NoteVersion[]> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const versions = await prisma.noteVersion.findMany({
      where: { noteId },
      orderBy: { createdAt: 'desc' },
    })

    return versions
  } catch (error) {
    console.error('fetchNoteVersions error:', handleServerActionError(error))
    throw error
  }
}

/**
 * 特定のバージョンを取得
 */
export async function fetchNoteVersion(versionId: string): Promise<NoteVersion | null> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const version = await prisma.noteVersion.findUnique({
      where: { id: versionId },
    })

    return version
  } catch (error) {
    console.error('fetchNoteVersion error:', handleServerActionError(error))
    throw error
  }
}

/**
 * バージョンを復元（現在のノートを指定バージョンの内容で上書き）
 */
export async function restoreNoteVersion(versionId: string): Promise<Note> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const version = await prisma.noteVersion.findUnique({
      where: { id: versionId },
    })
    
    if (!version) {
      throw new NotFoundError('Version not found')
    }

    // 現在の状態をバージョンとして保存（復元前のバックアップ）
    const currentNote = await prisma.note.findUnique({
      where: { id: version.noteId },
    })
    
    if (currentNote) {
      await prisma.noteVersion.create({
        data: {
          noteId: version.noteId,
          title: currentNote.title,
          content: currentNote.content,
          tags: currentNote.tags, // tagsも保存
        }
      })
    }

    // ノートを復元（tagsはバージョンに保存されていればそれを使用、なければ再計算）
    const restoredTags = version.tags && version.tags !== '[]' 
      ? version.tags 
      : extractTagsFromContent(version.content)

    const restored = await prisma.note.update({
      where: { id: version.noteId },
      data: {
        title: version.title,
        content: version.content,
        tags: restoredTags,
      },
    })

    revalidatePath('/')
    revalidatePath(`/notes/${version.noteId}`)
    
    return parseNote(restored)
  } catch (error) {
    console.error('restoreNoteVersion error:', handleServerActionError(error))
    throw error
  }
}

/**
 * バージョンを削除
 */
export async function deleteNoteVersion(versionId: string): Promise<void> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    await prisma.noteVersion.delete({
      where: { id: versionId },
    })
  } catch (error) {
    console.error('deleteNoteVersion error:', handleServerActionError(error))
    throw error
  }
}

/**
 * ノートを複製する（新規ノートとして作成、履歴は含まない）
 */
export async function duplicateNote(id: string): Promise<Note> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const originalNote = await prisma.note.findUnique({ where: { id } })
    if (!originalNote) {
      throw new NotFoundError('Note not found')
    }

    // 新しいノートを作成（ピン留めとアーカイブ状態はリセット）
    const duplicatedNote = await prisma.note.create({
      data: {
        title: `${originalNote.title}_Copy`,
        content: originalNote.content,
        isPinned: false,
        isArchived: false,
        tags: originalNote.tags,
        images: originalNote.images,
      }
    })

    revalidatePath('/')
    return parseNote(duplicatedNote)
  } catch (error) {
    console.error('duplicateNote error:', handleServerActionError(error))
    throw error
  }
}

/**
 * 指定ノートへのバックリンク（WikiLinkでリンクしているノート）を取得
 * @param noteId - 対象ノートのID
 * @returns バックリンクしているノートの一覧
 */
export async function fetchBacklinks(noteId: string): Promise<Note[]> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    // まず対象ノートのタイトルを取得
    const targetNote = await prisma.note.findUnique({
      where: { id: noteId },
      select: { title: true },
    })

    if (!targetNote) {
      throw new NotFoundError('Note not found')
    }

    const title = targetNote.title

    // タイトルが空の場合はバックリンクなし
    if (!title.trim()) {
      return []
    }

    // [[タイトル]] または [[タイトル|エイリアス]] を含むノートを検索
    // SQLiteのLIKE検索で部分一致
    const notes = await prisma.note.findMany({
      where: {
        id: { not: noteId }, // 自分自身を除外
        isArchived: false,
        content: {
          contains: `[[${title}`,
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // より厳密にフィルタリング（[[タイトル]] または [[タイトル|...]] の形式をチェック）
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wikiLinkRegex = new RegExp(`\\[\\[${escapedTitle}(\\|[^\\]]+)?\\]\\]`, 'i')

    const filteredNotes = notes.filter(note => wikiLinkRegex.test(note.content))

    return filteredNotes.map(parseNote)
  } catch (error) {
    console.error('fetchBacklinks error:', handleServerActionError(error))
    throw error
  }
}
