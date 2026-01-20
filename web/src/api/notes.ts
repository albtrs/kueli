import type { Note, NoteCreateData, NoteUpdateData, NoteVersion } from '@/lib/types'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'
import { apiFetch } from '@/lib/api'

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

export async function fetchNotesPage(
  cursor: string | null = null,
  limit: number = DEFAULT_PAGE_SIZE,
  tag?: string,
  search?: string,
  includeArchived: boolean = false,
  excludePinned: boolean = false,
  sortOrder: 'desc' | 'asc' = 'desc'
): Promise<NotesPageResult> {
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
}

export async function fetchNotes(includeArchived: boolean = false): Promise<Note[]> {
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
}

export async function fetchNote(id: string): Promise<Note | null> {
  try {
    const note = await requestJSON<any>(`/api/notes/${id}`)
    return parseNote(note)
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null
    }
    throw error
  }
}

export async function saveNote(id: string | null, data: NoteCreateData | NoteUpdateData): Promise<Note> {
  const method = id ? 'PUT' : 'POST'
  const path = id ? `/api/notes/${id}` : '/api/notes'

  const payload: Record<string, unknown> = { ...data }
  const note = await requestJSON<any>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseNote(note)
}

export async function deleteNote(id: string): Promise<void> {
  await requestJSON(`/api/notes/${id}`, { method: 'DELETE' })
}

export async function togglePin(id: string): Promise<Note> {
  const updated = await requestJSON<any>(`/api/notes/${id}/pin`, { method: 'POST' })
  return parseNote(updated)
}

export async function toggleArchive(id: string): Promise<Note> {
  const updated = await requestJSON<any>(`/api/notes/${id}/archive`, { method: 'POST' })
  return parseNote(updated)
}

export async function fetchNoteVersions(noteId: string): Promise<NoteVersion[]> {
  const versions = await requestJSON<any[]>(`/api/notes/${noteId}/versions`)
  return versions.map(parseNoteVersion)
}

export async function fetchNoteVersion(versionId: string): Promise<NoteVersion | null> {
  try {
    const version = await requestJSON<any>(`/api/versions/${versionId}`)
    return parseNoteVersion(version)
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null
    }
    throw error
  }
}

export async function restoreNoteVersion(versionId: string): Promise<Note> {
  const restored = await requestJSON<any>(`/api/versions/${versionId}/restore`, { method: 'POST' })
  return parseNote(restored)
}

export async function deleteNoteVersion(versionId: string): Promise<void> {
  await requestJSON(`/api/versions/${versionId}`, { method: 'DELETE' })
}

export async function duplicateNote(id: string): Promise<Note> {
  const duplicatedNote = await requestJSON<any>(`/api/notes/${id}/duplicate`, { method: 'POST' })
  return parseNote(duplicatedNote)
}

export async function fetchBacklinks(noteId: string): Promise<Note[]> {
  const notes = await requestJSON<any[]>(`/api/notes/${noteId}/backlinks`)
  return notes.map(parseNote)
}
