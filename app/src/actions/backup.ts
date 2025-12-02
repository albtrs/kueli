'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { UnauthorizedError } from '@/lib/errors';

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

interface ExportData {
  version: number;
  exportedAt: string;
  noteCount: number;
  notes: NoteExport[];
}

interface ImportResult {
  success: boolean;
  created: number;
  updated: number;
  errors: string[];
}

/**
 * 全ノートをJSON形式でエクスポート
 */
export async function exportNotes(): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  const notes = await prisma.note.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  const exportData: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    noteCount: notes.length,
    notes: notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      tags: note.tags,
      images: note.images,
      isPinned: note.isPinned,
      isArchived: note.isArchived,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * JSONからノートをインポート
 * 同じIDが存在する場合は上書き、存在しない場合は新規作成
 */
export async function importNotes(jsonContent: string): Promise<ImportResult> {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  const result: ImportResult = {
    success: false,
    created: 0,
    updated: 0,
    errors: [],
  };

  let data: ExportData;

  // JSONパース
  try {
    data = JSON.parse(jsonContent);
  } catch {
    result.errors.push('JSONの解析に失敗しました。ファイル形式を確認してください。');
    return result;
  }

  // バリデーション
  if (!data.notes || !Array.isArray(data.notes)) {
    result.errors.push('無効なバックアップファイルです。notesフィールドが見つかりません。');
    return result;
  }

  // トランザクションで一括処理
  try {
    const operations = data.notes.map(note => {
      // 日付の変換
      const createdAt = note.createdAt ? new Date(note.createdAt) : new Date();
      const updatedAt = note.updatedAt ? new Date(note.updatedAt) : new Date();

      // 無効な日付のチェック
      if (isNaN(createdAt.getTime())) {
        throw new Error(`無効な作成日時: ${note.id}`);
      }
      if (isNaN(updatedAt.getTime())) {
        throw new Error(`無効な更新日時: ${note.id}`);
      }

      const noteData = {
        title: note.title || '',
        content: note.content || '',
        tags: note.tags || '[]',
        images: note.images || '[]',
        isPinned: note.isPinned ?? false,
        isArchived: note.isArchived ?? false,
        createdAt,
        updatedAt,
      };

      return prisma.note.upsert({
        where: { id: note.id },
        update: noteData,
        create: {
          id: note.id,
          ...noteData,
        },
      });
    });

    // 既存のIDを取得して、作成/更新を判定
    const existingIds = new Set(
      (await prisma.note.findMany({
        where: { id: { in: data.notes.map(n => n.id) } },
        select: { id: true },
      })).map(n => n.id)
    );

    // カウント計算
    data.notes.forEach(note => {
      if (existingIds.has(note.id)) {
        result.updated++;
      } else {
        result.created++;
      }
    });

    // 実行
    await prisma.$transaction(operations);

    result.success = true;
  } catch (error) {
    result.errors.push(
      error instanceof Error ? error.message : 'インポート中にエラーが発生しました'
    );
    return result;
  }

  // キャッシュ更新
  revalidatePath('/');
  revalidatePath('/archived');

  return result;
}
