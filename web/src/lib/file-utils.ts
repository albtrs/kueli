/**
 * ファイル関連のユーティリティ関数
 */

// 許可するファイルタイプとMIMEタイプのマッピング
export const ALLOWED_FILE_TYPES: Record<string, string[]> = {
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
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  // 音声
  'audio/mpeg': ['.mp3'],
  'audio/mp3': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a'],
  'audio/ogg': ['.ogg'],
};

// 拡張子からMIMEタイプを取得
export const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/x-m4a',
  '.ogg': 'audio/ogg',
};

// ファイルカテゴリの型
export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'other';

// ファイル名から拡張子を取得
export function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? `.${ext}` : '';
}

// 拡張子からファイルカテゴリを判定
export function getFileCategory(filename: string): FileCategory {
  const ext = getFileExtension(filename);
  
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    return 'image';
  }
  if (['.mp4', '.webm', '.mov', '.avi'].includes(ext)) {
    return 'video';
  }
  if (['.mp3', '.wav', '.m4a', '.ogg'].includes(ext)) {
    return 'audio';
  }
  if (['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md', '.csv'].includes(ext)) {
    return 'document';
  }
  return 'other';
}

// MIMEタイプからファイルカテゴリを判定
export function getFileCategoryFromMime(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('application/pdf') || 
      mimeType.startsWith('text/') ||
      mimeType.includes('document') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation')) {
    return 'document';
  }
  return 'other';
}

// 許可された拡張子の一覧を取得
export function getAllowedExtensions(): string[] {
  return Object.values(ALLOWED_FILE_TYPES).flat();
}

// 拡張子が許可されているかチェック
export function isAllowedExtension(ext: string): boolean {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  return getAllowedExtensions().includes(normalizedExt.toLowerCase());
}

// MIMEタイプと拡張子の組み合わせが有効かチェック
export function isValidMimeAndExtension(mimeType: string, ext: string): boolean {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  const allowedExts = ALLOWED_FILE_TYPES[mimeType];
  return allowedExts ? allowedExts.includes(normalizedExt.toLowerCase()) : false;
}

// コンテンツから最初のメディアファイルを抽出
export function extractFirstMedia(
  content: string, 
  images: string[]
): { filename: string; type: 'image' | 'video' } | null {
  // まずimagesフィールドから画像/動画を探す
  for (const filename of images) {
    const category = getFileCategory(filename);
    if (category === 'image' || category === 'video') {
      return { filename, type: category };
    }
  }
  
  // コンテンツ内のMarkdown画像/リンクから探す
  const markdownPattern = /!\[.*?\]\((?:\/api\/files\/)?([^)]+)\)/g;
  let match;
  while ((match = markdownPattern.exec(content || '')) !== null) {
    const filename = match[1];
    const category = getFileCategory(filename);
    if (category === 'image' || category === 'video') {
      return { filename, type: category };
    }
  }
  
  return null;
}

// 最大ファイルサイズ（バイト）
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
