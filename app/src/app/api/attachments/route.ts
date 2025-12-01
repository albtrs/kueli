import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { UnauthorizedError, handleError } from '@/lib/errors';

// アップロードディレクトリのパス
const getUploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');

// すべてのノートのコンテンツから使用中のファイル名を抽出
async function getUsedFilenames(): Promise<Set<string>> {
  const notes = await prisma.note.findMany({
    select: { content: true, images: true }
  });
  
  const usedFiles = new Set<string>();
  
  notes.forEach(note => {
    // コンテンツ内のMarkdown画像/リンク参照を検索
    // ![alt](filename) or ![alt](/api/files/filename) パターン
    const markdownPattern = /!\[.*?\]\((?:\/api\/files\/)?([^)]+)\)/g;
    let match;
    while ((match = markdownPattern.exec(note.content || '')) !== null) {
      usedFiles.add(match[1]);
    }
    
    // imagesフィールドのファイルも追加
    const images = JSON.parse(note.images || '[]');
    images.forEach((img: string) => usedFiles.add(img));
  });
  
  return usedFiles;
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
    
    const usedFiles = await getUsedFilenames();
    
    // ファイル情報を取得
    const fileInfos = await Promise.all(
      files
        .filter(f => !f.startsWith('.')) // 隠しファイルを除外
        .map(async (filename) => {
          try {
            const filePath = join(uploadsDir, filename);
            const stats = await stat(filePath);
            return {
              filename,
              size: stats.size,
              createdAt: stats.birthtime,
              isUsed: usedFiles.has(filename),
            };
          } catch {
            return null;
          }
        })
    );
    
    // nullを除外してソート（使用中を先に、その後は日付順）
    const validFiles = fileInfos
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => {
        if (a.isUsed !== b.isUsed) return a.isUsed ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return NextResponse.json({
      files: validFiles,
      totalCount: validFiles.length,
      usedCount: validFiles.filter(f => f.isUsed).length,
      unusedCount: validFiles.filter(f => !f.isUsed).length,
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
    const usedFiles = await getUsedFilenames();
    
    const results = {
      deleted: [] as string[],
      failed: [] as { filename: string; reason: string }[],
      skipped: [] as string[],
    };
    
    for (const filename of filenames) {
      // パストラバーサル防止
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        results.failed.push({ filename, reason: 'Invalid filename' });
        continue;
      }
      
      // 使用中のファイルはスキップ（強制削除でない場合）
      if (usedFiles.has(filename)) {
        results.skipped.push(filename);
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
