'use client';

import { getFileCategory } from '@/lib/file-utils';

interface MediaRendererProps {
  src?: string;
  alt?: string;
  /** 画像のインデックス（ギャラリー用） */
  imageIndex?: number;
  /** 画像クリック時のコールバック */
  onImageClick?: (index: number) => void;
  /** 原寸大表示するか（親から制御） */
  isFullSize?: boolean;
}

/**
 * メディアファイルを適切な形式でレンダリングするコンポーネント
 * 画像、動画、音声、文書などを拡張子で自動判別
 * 
 * 画像サイズ:
 * - デフォルト: 小さめ表示（max-w-md）
 * - ボタンで原寸大表示に切り替え可能
 */
export function MediaRenderer({ src, alt, imageIndex, onImageClick, isFullSize = false }: MediaRendererProps) {
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
        className="w-full max-w-2xl max-h-[500px] rounded-lg my-4 bg-black" 
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
        <audio controls className="w-full max-w-md my-2">
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

  // 画像クリックハンドラ
  const handleClick = () => {
    if (onImageClick && imageIndex !== undefined) {
      onImageClick(imageIndex);
    }
  };

  // 画像（デフォルト）
  return (
    <img
      src={fullSrc}
      alt={alt || ''}
      className={
        isFullSize
          ? "max-w-full h-auto rounded-lg cursor-pointer inline-block align-top"
          : "max-w-md max-h-80 object-contain rounded-lg cursor-pointer inline-block align-top"
      }
      loading="lazy"
      onClick={handleClick}
    />
  );
}
