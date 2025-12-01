import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { UnauthorizedError, ValidationError, NotFoundError, handleError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user) {
      throw new UnauthorizedError();
    }

    const { filename } = await params;
    
    // パストラバーサル対策
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new ValidationError('Invalid filename');
    }

    // ファイルパスを構築
    const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');
    const filePath = join(uploadsDir, filename);

    // ファイルを読み込む
    const fileBuffer = await readFile(filePath);

    // MIMEタイプを判定
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      // 画像
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      // 文書
      pdf: 'application/pdf',
      txt: 'text/plain',
      md: 'text/markdown',
      csv: 'text/csv',
      // Office
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // アーカイブ
      zip: 'application/zip',
      // 動画
      mp4: 'video/mp4',
      // 音声
      mp3: 'audio/mpeg',
    };
    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';

    // レスポンスを返す
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      const notFoundError = new NotFoundError('File not found');
      const errorResponse = handleError(notFoundError);
      return NextResponse.json(errorResponse, { status: 404 });
    }
    
    const errorResponse = handleError(error);
    const statusCode = error.statusCode || 500;
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
