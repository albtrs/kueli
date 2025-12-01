import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { UnauthorizedError, ValidationError, handleError } from '@/lib/errors';

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

    // Validate file type (images only)
    if (!file.type.startsWith('image/')) {
      throw new ValidationError('Only image files are allowed');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new ValidationError('File size must be less than 10MB');
    }

    // Generate unique filename
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const ext = file.name.split('.').pop();
    const filename = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
    
    // Save to public/uploads directory (mounted from host)
    const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');
    
    // ディレクトリが存在しない場合は作成
    await mkdir(uploadsDir, { recursive: true });
    
    const filePath = join(uploadsDir, filename);
    await writeFile(filePath, buffer);
    
    return NextResponse.json({
      filename,
      url: `/api/images/${filename}`,
      size: file.size,
      type: file.type
    });
  } catch (error) {
    const errorResponse = handleError(error);
    const statusCode = error instanceof Error && 'statusCode' in error
      ? (error as any).statusCode
      : 500;
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
