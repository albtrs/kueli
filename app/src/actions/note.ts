'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Note, NoteCreateData, NoteUpdateData } from '@/lib/types'
import { UnauthorizedError, NotFoundError, handleServerActionError } from '@/lib/errors'

// ページネーション結果の型
export interface NotesPageResult {
  notes: Note[]
  nextCursor: string | null
  hasMore: boolean
}

const DEFAULT_PAGE_SIZE = 20

// Helper: Parse JSON fields
function parseNote(dbNote: any): Note {
  return {
    id: dbNote.id,
    title: dbNote.title,
    content: dbNote.content,
    isPinned: dbNote.isPinned,
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
 */
export async function fetchNotesPage(
  cursor: string | null = null,
  limit: number = DEFAULT_PAGE_SIZE,
  tag?: string,
  search?: string
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
      orderBy: { updatedAt: 'desc' },
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
 */
export async function fetchNotes(): Promise<Note[]> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const notes = await prisma.note.findMany({
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

export async function saveNote(id: string | null, data: NoteCreateData | NoteUpdateData): Promise<Note> {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new UnauthorizedError()
    }

    const noteData = {
      title: data.title || '無題のメモ',
      content: data.content || '',
      isPinned: data.isPinned || false,
      tags: JSON.stringify(data.tags || []),
      images: JSON.stringify(data.images || []),
    }

    let note
    if (id) {
      // Update existing note
      note = await prisma.note.update({
        where: { id },
        data: noteData,
      })
    } else {
      // Create new note
      note = await prisma.note.create({
        data: noteData,
      })
    }

    revalidatePath('/')
    revalidatePath(`/notes/${note.id}`)
    
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
