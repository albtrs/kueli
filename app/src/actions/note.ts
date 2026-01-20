'use server'

import { revalidatePath } from 'next/cache'
import { Note, NoteVersion, NoteCreateData, NoteUpdateData } from '@/lib/types'
import { UnauthorizedError, NotFoundError, handleServerActionError } from '@/lib/errors'
import { apiFetch } from '@/lib/api-client'

// ページネーション結果の型
export interface NotesPageResult {
  notes: Note[]
  nextCursor: string | null
  hasMore: boolean
}

const DEFAULT_PAGE_SIZE = 20

function parseNote(apiNote: any): Note {
  return {
    id: apiNote.id,
    title: apiNote.title,
    content: apiNote.content,
    isPinned: apiNote.isPinned,
    isArchived: apiNote.isArchived,
    tags: apiNote.tags || [],
    images: apiNote.images || [],
    createdAt: new Date(apiNote.createdAt),
    updatedAt: new Date(apiNote.updatedAt),
  }
}

function parseNoteVersion(apiVersion: any): NoteVersion {
  return {
    id: apiVersion.id,
    title: apiVersion.title,
    content: apiVersion.content,
    tags: apiVersion.tags || '[]',
    createdAt: new Date(apiVersion.createdAt),
    noteId: apiVersion.noteId,
  }
}

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init)
  if (response.status === 401) {
    throw new UnauthorizedError()
  }
  if (response.status === 404) {
    throw new NotFoundError('Not found')
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = payload?.error || 'Request failed'
    throw new Error(message)
  }
  return response.json() as Promise<T>
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
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (limit) params.set('limit', String(limit))
    if (tag) params.set('tag', tag)
    if (search) params.set('search', search)
    if (includeArchived) params.set('includeArchived', 'true')
    if (excludePinned) params.set('excludePinned', 'true')
    if (sortOrder) params.set('sort', sortOrder)

    const data = await requestJSON<{
      notes: any[]
      nextCursor: string | null
      hasMore: boolean
    }>(`/api/notes?${params.toString()}`)

    return {
      notes: data.notes.map(parseNote),
      nextCursor: data.nextCursor,
      hasMore: data.hasMore,
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
    const all: Note[] = []
    let cursor: string | null = null
    let hasMore = true

    while (hasMore) {
      const page = await fetchNotesPage(cursor, 200, undefined, undefined, includeArchived, false, 'desc')
      all.push(...page.notes)
      cursor = page.nextCursor
      hasMore = page.hasMore
    }

    return all
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
    const note = await requestJSON<any>(`/api/notes/${id}`)
    return parseNote(note)
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null
    }
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
export async function saveNote(id: string | null, data: NoteCreateData | NoteUpdateData): Promise<Note> {
  try {
    const method = id ? 'PUT' : 'POST'
    const path = id ? `/api/notes/${id}` : '/api/notes'

    const payload: Record<string, unknown> = { ...data }
    const note = await requestJSON<any>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

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
    await requestJSON(`/api/notes/${id}`, { method: 'DELETE' })
    revalidatePath('/')
  } catch (error) {
    console.error('deleteNote error:', handleServerActionError(error))
    throw error
  }
}

export async function togglePin(id: string): Promise<Note> {
  try {
    const updated = await requestJSON<any>(`/api/notes/${id}/pin`, { method: 'POST' })
    revalidatePath('/')
    return parseNote(updated)
  } catch (error) {
    console.error('togglePin error:', handleServerActionError(error))
    throw error
  }
}

export async function toggleArchive(id: string): Promise<Note> {
  try {
    const updated = await requestJSON<any>(`/api/notes/${id}/archive`, { method: 'POST' })
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
    const versions = await requestJSON<any[]>(`/api/notes/${noteId}/versions`)
    return versions.map(parseNoteVersion)
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
    const version = await requestJSON<any>(`/api/versions/${versionId}`)
    return parseNoteVersion(version)
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null
    }
    console.error('fetchNoteVersion error:', handleServerActionError(error))
    throw error
  }
}

/**
 * バージョンを復元（現在のノートを指定バージョンの内容で上書き）
 */
export async function restoreNoteVersion(versionId: string): Promise<Note> {
  try {
    const restored = await requestJSON<any>(`/api/versions/${versionId}/restore`, {
      method: 'POST',
    })
    revalidatePath('/')
    revalidatePath(`/notes/${restored.id}`)
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
    await requestJSON(`/api/versions/${versionId}`, { method: 'DELETE' })
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
    const duplicatedNote = await requestJSON<any>(`/api/notes/${id}/duplicate`, { method: 'POST' })
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
    const notes = await requestJSON<any[]>(`/api/notes/${noteId}/backlinks`)
    return notes.map(parseNote)
  } catch (error) {
    console.error('fetchBacklinks error:', handleServerActionError(error))
    throw error
  }
}
