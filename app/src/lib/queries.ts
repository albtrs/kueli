import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { cache } from 'react'
import { Note } from '@/lib/types'
import { UnauthorizedError } from '@/lib/errors'

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
    tags: JSON.parse(dbNote.tags || '[]'),
    images: JSON.parse(dbNote.images || '[]'),
    createdAt: dbNote.createdAt,
    updatedAt: dbNote.updatedAt,
  }
}

/**
 * ノートをページネーションで取得（カーソルベース）
 * @param cursor - 前回の最後のノートID（初回はnull）
 * @param limit - 取得件数（デフォルト20）
 * @param tag - タグでフィルタ（オプション）
 * @param search - 検索クエリ（オプション）
 */
export async function getNotesPage(
  cursor: string | null = null,
  limit: number = DEFAULT_PAGE_SIZE,
  tag?: string,
  search?: string
): Promise<NotesPage> {
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
      // SQLite の JSON には LIKE で対応
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
      skip: 1, // カーソル自体はスキップ
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
}

/**
 * 全ノート取得（Request Memoization 適用）
 * 同一リクエスト内で複数回呼ばれてもDBアクセスは1回だけ
 * ※ Server Components 専用。Client Components は actions/note.ts の fetchNotes を使用
 * ※ サイドバー用（タグ集計・ピン留め用）に残す
 */
export const getNotes = cache(async (): Promise<Note[]> => {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError()
  }

  const notes = await prisma.note.findMany({
    orderBy: { updatedAt: 'desc' },
  })

  return notes.map(parseNote)
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

  const note = await prisma.note.findUnique({
    where: { id },
  })

  if (!note) return null
  return parseNote(note)
})
