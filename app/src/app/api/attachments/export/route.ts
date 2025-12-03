import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { UnauthorizedError, handleError } from '@/lib/errors';

// JSZipはdynamic importで使用
async function createZip() {
  const JSZip = (await import('jszip')).default;
  return new JSZip();
}

// アップロードディレクトリのパス
const getUploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');

/**
 * 添付ファイルをZIPでエクスポート
 */
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
      // 隠しファイルを除外
      files = files.filter(f => !f.startsWith('.'));
    } catch (e) {
      // ディレクトリが存在しない場合は空
      files = [];
    }

    if (files.length === 0) {
      return NextResponse.json({ error: '添付ファイルがありません' }, { status: 404 });
    }

    // ZIPファイルを作成
    const zip = await createZip();
    
    for (const filename of files) {
      try {
        const filePath = join(uploadsDir, filename);
        const content = await readFile(filePath);
        zip.file(filename, content);
      } catch (e) {
        console.error(`Failed to read file: ${filename}`, e);
        // ファイル読み取りに失敗してもスキップして続行
      }
    }

    // ZIPを生成
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // ファイル名に日付を含める
    const date = new Date().toISOString().split('T')[0];
    const filename = `attachments_backup_${date}.zip`;

    // BufferをUint8Arrayに変換
    const uint8Array = new Uint8Array(zipBuffer);

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const errorResponse = handleError(error);
    const statusCode = error instanceof Error && 'statusCode' in error
      ? (error as any).statusCode
      : 500;
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
