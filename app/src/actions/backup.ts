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

interface ExportData {
  version: number;
  exportedAt: string;
  noteCount: number;
  versionCount: number;
  notes: NoteExport[];
  versions: NoteVersionExport[];
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
  const session = await auth();
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  const notes = await prisma.note.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  const versions = await prisma.noteVersion.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const exportData: ExportData = {
    version: 2, // バージョン履歴を含むv2形式
    exportedAt: new Date().toISOString(),
    noteCount: notes.length,
    versionCount: versions.length,
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
    versions: versions.map(version => ({
      id: version.id,
      noteId: version.noteId,
      title: version.title,
      content: version.content,
      tags: version.tags,
      createdAt: version.createdAt.toISOString(),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * JSONからノートと履歴をインポート
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
    versionsCreated: 0,
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
    // 既存のIDを取得して、作成/更新を判定
    const existingNoteIds = new Set(
      (await prisma.note.findMany({
        where: { id: { in: data.notes.map(n => n.id) } },
        select: { id: true },
      })).map(n => n.id)
    );

    // ノートのupsert操作
    const noteOperations = data.notes.map(note => {
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

    // カウント計算
    data.notes.forEach(note => {
      if (existingNoteIds.has(note.id)) {
        result.updated++;
      } else {
        result.created++;
      }
    });

    // ノートを先に実行
    await prisma.$transaction(noteOperations);

    // バージョン履歴のインポート（v2形式の場合）
    if (data.versions && Array.isArray(data.versions) && data.versions.length > 0) {
      // インポートするバージョンのnoteIdが存在するか確認
      const validNoteIds = new Set(data.notes.map(n => n.id));
      const existingNoteIdsInDb = new Set(
        (await prisma.note.findMany({
          select: { id: true },
        })).map(n => n.id)
      );
      
      // 既存のバージョンIDを取得
      const existingVersionIds = new Set(
        (await prisma.noteVersion.findMany({
          where: { id: { in: data.versions.map(v => v.id) } },
          select: { id: true },
        })).map(v => v.id)
      );

      const versionOperations = data.versions
        .filter(version => {
          // noteIdが存在するノートに属するもののみ
          return validNoteIds.has(version.noteId) || existingNoteIdsInDb.has(version.noteId);
        })
        .filter(version => {
          // 既存のバージョンはスキップ
          return !existingVersionIds.has(version.id);
        })
        .map(version => {
          const createdAt = version.createdAt ? new Date(version.createdAt) : new Date();
          
          if (isNaN(createdAt.getTime())) {
            throw new Error(`無効なバージョン作成日時: ${version.id}`);
          }

          return prisma.noteVersion.create({
            data: {
              id: version.id,
              noteId: version.noteId,
              title: version.title || '',
              content: version.content || '',
              tags: version.tags || '[]',
              createdAt,
            },
          });
        });

      if (versionOperations.length > 0) {
        await prisma.$transaction(versionOperations);
        result.versionsCreated = versionOperations.length;
      }
    }

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
