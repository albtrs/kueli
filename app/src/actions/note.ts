'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Note, NoteCreateData, NoteUpdateData } from '@/lib/types'
import { UnauthorizedError, NotFoundError, handleServerActionError } from '@/lib/errors'

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

export async function getNotes(): Promise<Note[]> {
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
    console.error('getNotes error:', handleServerActionError(error))
    throw error
  }
}

export async function getNote(id: string): Promise<Note | null> {
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
    console.error('getNote error:', handleServerActionError(error))
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
