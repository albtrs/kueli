'use server';

import { revalidatePath } from 'next/cache';
import { UnauthorizedError } from '@/lib/errors';
import { apiFetch } from '@/lib/api-client';

/**
 * バックアップ用ノートエクスポート型
 * DBのスキーマと同じ構造
 */
interface NoteExport {
  id: string;
  title: string;
  content: string;
  tags: string;      // JSON string
  images: string;    // JSON string
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * バックアップ用バージョンエクスポート型
 */
interface NoteVersionExport {
  id: string;
  noteId: string;
  title: string;
  content: string;
  tags: string;      // JSON string
  createdAt: string; // ISO 8601
}

interface ImportResult {
  success: boolean;
  created: number;
  updated: number;
  versionsCreated: number;
  errors: string[];
}

/**
 * 全ノートと履歴をJSON形式でエクスポート
 */
export async function exportNotes(): Promise<string> {
  const response = await apiFetch('/api/backup/notes');
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error('Export failed');
  }
  return await response.text();
}

/**
 * JSONからノートと履歴をインポート
 * 同じIDが存在する場合は上書き、存在しない場合は新規作成
 */
export async function importNotes(jsonContent: string): Promise<ImportResult> {
  const response = await apiFetch('/api/backup/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonContent,
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error('Import failed');
  }

  const result = await response.json();
  if (result?.success) {
    revalidatePath('/');
    revalidatePath('/archived');
  }
  return result;
}
