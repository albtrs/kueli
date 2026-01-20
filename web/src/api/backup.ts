import { UnauthorizedError } from '@/lib/errors'
import { apiFetch } from '@/lib/api'

export interface ImportResult {
  success: boolean
  created: number
  updated: number
  versionsCreated: number
  errors: string[]
}

export async function exportNotes(): Promise<string> {
  const response = await apiFetch('/api/backup/notes')
  if (response.status === 401) {
    throw new UnauthorizedError()
  }
  if (!response.ok) {
    throw new Error('Export failed')
  }
  return response.text()
}

export async function importNotes(jsonContent: string): Promise<ImportResult> {
  const response = await apiFetch('/api/backup/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonContent,
  })

  if (response.status === 401) {
    throw new UnauthorizedError()
  }
  if (!response.ok) {
    throw new Error('Import failed')
  }

  return response.json()
}
