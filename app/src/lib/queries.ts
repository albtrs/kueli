import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { cache } from 'react'
import { Note } from '@/lib/types'
import { UnauthorizedError } from '@/lib/errors'

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
 * 全ノート取得（Request Memoization 適用）
 * 同一リクエスト内で複数回呼ばれてもDBアクセスは1回だけ
 * ※ Server Components 専用。Client Components は actions/note.ts の fetchNotes を使用
 */
export const getNotes = cache(async (): Promise<Note[]> => {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError()
  }

  console.log('📦 getNotes: Fetching from DB...')
  
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

  console.log(`📦 getNote(${id}): Fetching from DB...`)

  const note = await prisma.note.findUnique({
    where: { id },
  })

  if (!note) return null
  return parseNote(note)
})
