'use client';

import { getFileCategory } from '@/lib/file-utils';

interface MediaRendererProps {
  src?: string;
  alt?: string;
}

/**
 * altテキストからObsidianスタイルのサイズ指定を抽出
 * 例: "説明文|300" → { cleanAlt: "説明文", width: "300" }
 * 例: "|300x200" → { cleanAlt: "", width: "300", height: "200" }
 */
function parseAltWithSize(alt?: string): { cleanAlt: string; width?: string; height?: string } {
  if (!alt || !alt.includes('|')) {
    return { cleanAlt: alt || '' };
  }

  const parts = alt.split('|');
  const potentialSize = parts.pop()?.trim();
  
  if (!potentialSize) {
    return { cleanAlt: alt };
  }

  // "300x200" or "300" パターンをチェック
  const sizeMatch = potentialSize.match(/^(\d+)(?:x(\d+))?$/);
  
  if (sizeMatch) {
    return {
      cleanAlt: parts.join('|').trim(),
      width: sizeMatch[1],
      height: sizeMatch[2],
    };
  }

  // 数字じゃなかったら元に戻す（ただのパイプ文字かもしれない）
  return { cleanAlt: alt };
}

/**
 * メディアファイルを適切な形式でレンダリングするコンポーネント
 * 画像、動画、音声、文書などを拡張子で自動判別
 * 
 * Obsidianスタイルのサイズ指定に対応:
 * - ![説明|300](image.png) → 幅300px
 * - ![|300x200](image.png) → 幅300px、高さ200px
 */
export function MediaRenderer({ src, alt }: MediaRendererProps) {
  if (!src || typeof src !== 'string') return null;

  // altからサイズを抽出
  const { cleanAlt, width, height } = parseAltWithSize(alt);

  // /api/files/ がない場合は補完
  const fullSrc = src.startsWith('/api/files/') || src.startsWith('http') 
    ? src 
    : `/api/files/${src}`;

  const ext = src.split('.').pop()?.toLowerCase() || '';
  const filename = cleanAlt || src.split('/').pop() || 'file';
  const category = getFileCategory(src);

  // 動画
  if (category === 'video') {
    return (
      <video 
        controls 
        className="w-full max-h-[500px] rounded-lg my-4 bg-black" 
        preload="metadata"
        style={{
          width: width ? `${width}px` : undefined,
          height: height ? `${height}px` : undefined,
          maxWidth: '100%',
        }}
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
      alt={cleanAlt}
      className="max-w-full h-auto rounded-lg my-2"
      loading="lazy"
      style={{
        width: width ? `${width}px` : 'auto',
        height: height ? `${height}px` : 'auto',
        maxWidth: '100%',
      }}
    />
  );
}
