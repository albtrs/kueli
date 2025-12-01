import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { UnauthorizedError, ValidationError, handleError } from '@/lib/errors';
import { 
  ALLOWED_FILE_TYPES, 
  getAllowedExtensions, 
  isValidMimeAndExtension,
  getFileCategoryFromMime,
  MAX_FILE_SIZE 
} from '@/lib/file-utils';

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
    const allowedExtensions = getAllowedExtensions();
    if (!allowedExtensions.includes(ext)) {
      throw new ValidationError(
        `File type not allowed. Allowed types: ${allowedExtensions.join(', ')}`
      );
    }

    // MIMEタイプも確認（より厳密なチェック）
    if (!isValidMimeAndExtension(file.type, ext)) {
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
    
    // ファイルカテゴリを判定
    const fileCategory = getFileCategoryFromMime(file.type);
    
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
