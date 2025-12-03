import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { UnauthorizedError, handleError } from '@/lib/errors';

// アップロードディレクトリのパス
const getUploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');

// ファイル使用状態
type FileUsageStatus = 'current' | 'history' | 'unused';

interface FileUsageResult {
  status: FileUsageStatus;
  inCurrent: boolean;  // 現行（アーカイブ含む）で使用中
  inHistory: boolean;  // 履歴で使用中
}

// 全てのノートと履歴から使用中のファイル名を抽出
async function getFileUsageMap(): Promise<Map<string, FileUsageResult>> {
  // 現行のノートを取得
  const notes = await prisma.note.findMany({
    select: { content: true, images: true }
  });
  
  // 履歴を取得
  const versions = await prisma.noteVersion.findMany({
    select: { content: true }
  });
  
  const usageMap = new Map<string, FileUsageResult>();
  
  // コンテンツからファイル名を抽出するヘルパー
  const extractFilenames = (content: string): string[] => {
    const filenames: string[] = [];
    // ![alt](filename) or ![alt](/api/files/filename) パターン
    const markdownPattern = /!\[.*?\]\((?:\/api\/files\/)?([^)]+)\)/g;
    let match;
    while ((match = markdownPattern.exec(content || '')) !== null) {
      filenames.push(match[1]);
    }
    return filenames;
  };
  
  // 現行ノートの検索
  notes.forEach(note => {
    const filenames = extractFilenames(note.content || '');
    
    // imagesフィールドのファイルも追加
    const images = JSON.parse(note.images || '[]');
    filenames.push(...images);
    
    filenames.forEach(filename => {
      const existing = usageMap.get(filename);
      if (existing) {
        existing.inCurrent = true;
        existing.status = 'current';
      } else {
        usageMap.set(filename, {
          status: 'current',
          inCurrent: true,
          inHistory: false,
        });
      }
    });
  });
  
  // 履歴の検索
  versions.forEach(version => {
    const filenames = extractFilenames(version.content || '');
    
    filenames.forEach(filename => {
      const existing = usageMap.get(filename);
      if (existing) {
        existing.inHistory = true;
        // 現行で使用されていなければ履歴使用中に
        if (!existing.inCurrent) {
          existing.status = 'history';
        }
      } else {
        usageMap.set(filename, {
          status: 'history',
          inCurrent: false,
          inHistory: true,
        });
      }
    });
  });
  
  return usageMap;
}

// ファイル一覧を取得
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new UnauthorizedError();
    }

    const uploadsDir = getUploadsDir();
    
    let files: string[] = [];
    try {
      files = await readdir(uploadsDir);
    } catch (e) {
      // ディレクトリが存在しない場合は空配列
      files = [];
    }
    
    const usageMap = await getFileUsageMap();
    
    // ファイル情報を取得
    const fileInfos = await Promise.all(
      files
        .filter(f => !f.startsWith('.')) // 隠しファイルを除外
        .map(async (filename) => {
          try {
            const filePath = join(uploadsDir, filename);
            const stats = await stat(filePath);
            const usage = usageMap.get(filename);
            return {
              filename,
              size: stats.size,
              createdAt: stats.birthtime,
              status: usage?.status || 'unused' as FileUsageStatus,
              inCurrent: usage?.inCurrent || false,
              inHistory: usage?.inHistory || false,
            };
          } catch {
            return null;
          }
        })
    );
    
    // nullを除外してソート（現行使用中 → 履歴使用中 → 未使用、その後は日付順）
    const validFiles = fileInfos
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => {
        const statusOrder = { current: 0, history: 1, unused: 2 };
        if (a.status !== b.status) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return NextResponse.json({
      files: validFiles,
      totalCount: validFiles.length,
      currentCount: validFiles.filter(f => f.status === 'current').length,
      historyCount: validFiles.filter(f => f.status === 'history').length,
      unusedCount: validFiles.filter(f => f.status === 'unused').length,
    });
  } catch (error) {
    const errorResponse = handleError(error);
    const statusCode = error instanceof Error && 'statusCode' in error
      ? (error as any).statusCode
      : 500;
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}

// ファイルを削除
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new UnauthorizedError();
    }

    const { filenames } = await req.json();
    
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return NextResponse.json({ error: 'No filenames provided' }, { status: 400 });
    }

    const uploadsDir = getUploadsDir();
    const usageMap = await getFileUsageMap();
    
    const results = {
      deleted: [] as string[],
      failed: [] as { filename: string; reason: string }[],
      skippedCurrent: [] as string[],  // 現行で使用中のためスキップ
      skippedHistory: [] as string[],  // 履歴で使用中のためスキップ
    };
    
    for (const filename of filenames) {
      // パストラバーサル防止
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        results.failed.push({ filename, reason: 'Invalid filename' });
        continue;
      }
      
      const usage = usageMap.get(filename);
      
      // 現行で使用中のファイルはスキップ
      if (usage?.inCurrent) {
        results.skippedCurrent.push(filename);
        continue;
      }
      
      // 履歴で使用中のファイルもスキップ
      if (usage?.inHistory) {
        results.skippedHistory.push(filename);
        continue;
      }
      
      try {
        const filePath = join(uploadsDir, filename);
        await unlink(filePath);
        results.deleted.push(filename);
      } catch (e) {
        results.failed.push({ filename, reason: 'File not found or permission denied' });
      }
    }
    
    return NextResponse.json(results);
  } catch (error) {
    const errorResponse = handleError(error);
    const statusCode = error instanceof Error && 'statusCode' in error
      ? (error as any).statusCode
      : 500;
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
