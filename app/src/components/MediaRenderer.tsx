'use client';

import { getFileCategory } from '@/lib/file-utils';

interface MediaRendererProps {
  src?: string;
  alt?: string;
}

/**
 * メディアファイルを適切な形式でレンダリングするコンポーネント
 * 画像、動画、音声、文書などを拡張子で自動判別
 */
export function MediaRenderer({ src, alt }: MediaRendererProps) {
  if (!src || typeof src !== 'string') return null;

  // /api/files/ がない場合は補完
  const fullSrc = src.startsWith('/api/files/') || src.startsWith('http') 
    ? src 
    : `/api/files/${src}`;

  const ext = src.split('.').pop()?.toLowerCase() || '';
  const filename = alt || src.split('/').pop() || 'file';
  const category = getFileCategory(src);

  // 動画
  if (category === 'video') {
    return (
      <video 
        controls 
        className="w-full max-h-[500px] rounded-lg my-4 bg-black" 
        preload="metadata"
      >
        <source src={fullSrc} />
        動画を再生できません。
      </video>
    );
  }

  // 音声
  if (category === 'audio') {
    return (
      <>
        <audio controls className="w-full my-2">
          <source src={fullSrc} />
          音声を再生できません。
        </audio>
        <span className="text-sm text-muted-foreground block mt-1">{filename}</span>
      </>
    );
  }

  // 文書ファイル（PDF、Office、Zipなど）
  if (category === 'document' || ['zip'].includes(ext)) {
    return (
      <span className="inline-block my-2">
        <a
          href={fullSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
        >
          <span className="text-xl">📎</span>
          <span className="font-medium">{filename}</span>
        </a>
      </span>
    );
  }

  // 画像（デフォルト）
  return (
    <img
      src={fullSrc}
      alt={alt || ''}
      className="max-w-full h-auto rounded-lg my-2"
      loading="lazy"
    />
  );
}
