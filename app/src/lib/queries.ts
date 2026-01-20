import { auth } from '@/lib/auth'
import { cache } from 'react'
import { Note } from '@/lib/types'
import { UnauthorizedError } from '@/lib/errors'
import { apiFetch } from '@/lib/api-client'

// デフォルトの1ページあたりの件数
export const DEFAULT_PAGE_SIZE = 20

// ページネーション結果の型
export interface NotesPage {
  notes: Note[]
  nextCursor: string | null
  hasMore: boolean
}

// Helper: Parse JSON fields
function parseNote(dbNote: any): Note {
  return {
    id: dbNote.id,
    title: dbNote.title,
    content: dbNote.content,
    isPinned: dbNote.isPinned,
    isArchived: dbNote.isArchived,
    tags: dbNote.tags || [],
    images: dbNote.images || [],
    createdAt: new Date(dbNote.createdAt),
    updatedAt: new Date(dbNote.updatedAt),
  }
}

/**
 * ノートをページネーションで取得（カーソルベース）
 * @param cursor - 前回の最後のノートID（初回はnull）
 * @param limit - 取得件数（デフォルト20）
 * @param tag - タグでフィルタ（オプション）
 * @param search - 検索クエリ（オプション）
 * @param includeArchived - アーカイブ済みを含める（デフォルトfalse）
 * @param excludePinned - ピン留めを除外する（デフォルトfalse）
 * @param sortOrder - ソート順（'desc' | 'asc'、デフォルト'desc'）
 */
export async function getNotesPage(
  cursor: string | null = null,
  limit: number = DEFAULT_PAGE_SIZE,
  tag?: string,
  search?: string,
  includeArchived: boolean = false,
  excludePinned: boolean = false,
  sortOrder: 'desc' | 'asc' = 'desc'
): Promise<NotesPage> {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError()
  }

  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (limit) params.set('limit', String(limit))
  if (tag) params.set('tag', tag)
  if (search) params.set('search', search)
  if (includeArchived) params.set('includeArchived', 'true')
  if (excludePinned) params.set('excludePinned', 'true')
  if (sortOrder) params.set('sort', sortOrder)

  const response = await apiFetch(`/api/notes?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch notes')
  }
  const data = await response.json()

  return {
    notes: data.notes.map(parseNote),
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
  }
}

/**
 * 全ノート取得（Request Memoization 適用）
 * 同一リクエスト内で複数回呼ばれてもDBアクセスは1回だけ
 * ※ Server Components 専用。Client Components は actions/note.ts の fetchNotes を使用
 * ※ サイドバー用（タグ集計・ピン留め用）に残す
 * @param includeArchived - アーカイブ済みを含める（デフォルトfalse）
 */
export const getNotes = cache(async (includeArchived: boolean = false): Promise<Note[]> => {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError()
  }
  const all: Note[] = []
  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    const page = await getNotesPage(cursor, DEFAULT_PAGE_SIZE, undefined, undefined, includeArchived, false, 'desc')
    all.push(...page.notes)
    cursor = page.nextCursor
    hasMore = page.hasMore
  }

  return all
})

/**
 * 個別ノート取得（Request Memoization 適用）
 * ※ Server Components 専用。Client Components は actions/note.ts の fetchNote を使用
 */
export const getNote = cache(async (id: string): Promise<Note | null> => {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError()
  }
  const response = await apiFetch(`/api/notes/${id}`)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error('Failed to fetch note')
  }
  const data = await response.json()
  return parseNote(data)
})
