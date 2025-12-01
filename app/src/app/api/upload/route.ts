import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { UnauthorizedError, ValidationError, handleError } from '@/lib/errors';

// 許可するファイルタイプ
const ALLOWED_FILE_TYPES = {
  // 画像
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  // 文書
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  // Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  // アーカイブ
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
  // 動画
  'video/mp4': ['.mp4'],
  // 音声
  'audio/mpeg': ['.mp3'],
  'audio/mp3': ['.mp3'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new UnauthorizedError();
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      throw new ValidationError('No file uploaded');
    }

    // 拡張子を取得
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    
    // ファイルタイプのバリデーション
    const allowedExtensions = Object.values(ALLOWED_FILE_TYPES).flat();
    if (!allowedExtensions.includes(ext)) {
      throw new ValidationError(
        `File type not allowed. Allowed types: ${allowedExtensions.join(', ')}`
      );
    }

    // MIMEタイプも確認（より厳密なチェック）
    const isValidMimeType = Object.entries(ALLOWED_FILE_TYPES).some(
      ([mimeType, exts]) => file.type === mimeType && exts.includes(ext)
    );
    
    if (!isValidMimeType) {
      throw new ValidationError('File MIME type does not match extension');
    }

    // ファイルサイズのバリデーション
    if (file.size > MAX_FILE_SIZE) {
      throw new ValidationError(`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Generate unique filename
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const filename = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    
    // Save to public/uploads directory (mounted from host)
    const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');
    
    // ディレクトリが存在しない場合は作成
    await mkdir(uploadsDir, { recursive: true });
    
    const filePath = join(uploadsDir, filename);
    await writeFile(filePath, buffer);
    
    // ファイルタイプを判定
    const fileCategory = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('audio/') ? 'audio'
      : 'file';
    
    return NextResponse.json({
      filename,
      url: filename,  // ファイル名のみ（プレフィックスなし）
      size: file.size,
      type: file.type,
      category: fileCategory,
      originalName: file.name
    });
  } catch (error) {
    const errorResponse = handleError(error);
    const statusCode = error instanceof Error && 'statusCode' in error
      ? (error as any).statusCode
      : 500;
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
