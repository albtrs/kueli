import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { UnauthorizedError, handleError } from '@/lib/errors';

// JSZipはdynamic importで使用
async function loadZip(buffer: Buffer) {
  const JSZip = (await import('jszip')).default;
  return await JSZip.loadAsync(buffer);
}

// アップロードディレクトリのパス
const getUploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');

/**
 * ZIPから添付ファイルをインポート
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new UnauthorizedError();
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'ファイルがアップロードされていません' }, { status: 400 });
    }

    // MIMEタイプチェック
    if (!file.type.includes('zip') && !file.name.endsWith('.zip')) {
      return NextResponse.json({ error: 'ZIPファイルを選択してください' }, { status: 400 });
    }

    const uploadsDir = getUploadsDir();
    
    // ディレクトリが存在しない場合は作成
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (e) {
      // 既に存在する場合は無視
    }

    // ZIPファイルを読み込み
    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = await loadZip(buffer);
    
    const results = {
      imported: [] as string[],
      skipped: [] as string[],
      failed: [] as { filename: string; reason: string }[],
    };

    // ファイルを展開
    const fileNames = Object.keys(zip.files);
    
    for (const filename of fileNames) {
      const zipEntry = zip.files[filename];
      
      // ディレクトリはスキップ
      if (zipEntry.dir) continue;
      
      // パストラバーサル防止
      const safeName = filename.split('/').pop() || filename;
      if (safeName.includes('..') || safeName.startsWith('.')) {
        results.skipped.push(filename);
        continue;
      }
      
      try {
        const content = await zipEntry.async('nodebuffer');
        const filePath = join(uploadsDir, safeName);
        
        // ファイルを書き込み（上書き）
        await writeFile(filePath, content);
        results.imported.push(safeName);
      } catch (e) {
        console.error(`Failed to import file: ${filename}`, e);
        results.failed.push({ 
          filename: safeName, 
          reason: e instanceof Error ? e.message : 'Unknown error' 
        });
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      totalImported: results.imported.length,
    });
  } catch (error) {
    console.error('Import error:', error);
    const errorResponse = handleError(error);
    const statusCode = error instanceof Error && 'statusCode' in error
      ? (error as any).statusCode
      : 500;
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
