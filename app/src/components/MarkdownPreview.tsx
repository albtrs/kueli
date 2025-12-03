'use client';

import { useMemo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkWikiLink from 'remark-wiki-link';
import { MediaRenderer } from './MediaRenderer';
import { LinkPreview } from './LinkPreview';
import { ImageGalleryModal, GalleryImage } from './ui/image-gallery-modal';

interface MarkdownPreviewProps {
  content: string;
  permalinks: Record<string, string>;
  /** 画像を原寸大で表示するか */
  isFullSizeImages?: boolean;
}

// #タグをリンク+ハイライトに変換する関数
function processHashtags(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    const parts = children.split(/(#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)/g);
    if (parts.length === 1) return children;
    
    return parts.map((part, index) => {
      if (part.match(/^#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+$/)) {
        const tag = part.slice(1); // # を除去
        return (
          <a
            key={index}
            href={`/?tag=${encodeURIComponent(tag)}`}
            className="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }
  
  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return <span key={index}>{processHashtags(child)}</span>;
      }
      return child;
    });
  }
  
  return children;
}

/**
 * Markdownプレビューコンポーネント
 * Tailwind CSSでミニマルなスタイルを適用
 * - remark-breaks: 改行を<br>に変換
 */
export function MarkdownPreview({ content, permalinks, isFullSizeImages = false }: MarkdownPreviewProps) {
  // 画像ギャラリー用の状態
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // コンテンツから画像を抽出
  const images = useMemo((): GalleryImage[] => {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const result: GalleryImage[] = [];
    let match;
    
    while ((match = imageRegex.exec(content)) !== null) {
      const alt = match[1];
      const src = match[2];
      
      // /api/files/ がない場合は補完
      const fullSrc = src.startsWith('/api/files/') || src.startsWith('http') 
        ? src 
        : `/api/files/${src}`;
      
      result.push({ src: fullSrc, alt });
    }
    
    return result;
  }, [content]);

  // 画像クリックハンドラ
  const handleImageClick = useCallback((index: number) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  }, []);

  // カスタムMarkdownレンダラー
  const markdownComponents: any = useMemo(() => ({
    // --- 見出し ---
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold mt-6 mb-3 pb-2 border-b border-border">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-semibold mt-5 mb-2 pb-1 border-b border-border/50">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-medium mt-4 mb-2">{children}</h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="text-base font-medium mt-3 mb-1">{children}</h4>
    ),
    h5: ({ children }: any) => (
      <h5 className="text-sm font-medium mt-2 mb-1">{children}</h5>
    ),
    h6: ({ children }: any) => (
      <h6 className="text-sm font-medium mt-2 mb-1 text-muted-foreground">{children}</h6>
    ),

    // --- 本文 ---
    p: ({ children }: any) => (
      <p className="leading-7 mb-3">{processHashtags(children)}</p>
    ),

    // --- リスト ---
    ul: ({ children }: any) => (
      <ul className="list-disc list-outside ml-6 mb-3 space-y-1">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside ml-6 mb-3 space-y-1">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="leading-7">{children}</li>
    ),

    // --- 引用 ---
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-muted-foreground/30 pl-4 py-1 my-3 text-muted-foreground italic">
        {children}
      </blockquote>
    ),

    // --- コード ---
    code: ({ className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match;
      
      if (isInline) {
        return (
          <code className="bg-muted text-primary rounded px-1.5 py-0.5 text-sm font-mono">
            {children}
          </code>
        );
      }
      // コードブロック
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }: any) => (
      <pre className="bg-muted rounded-md p-4 my-3 overflow-x-auto text-sm font-mono">
        {children}
      </pre>
    ),

    // --- テーブル ---
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-3 border border-border rounded-md">
        <table className="w-full text-sm text-left">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-muted text-foreground font-medium border-b border-border">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-border">{children}</tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="hover:bg-muted/50 transition-colors">{children}</tr>
    ),
    th: ({ children }: any) => (
      <th className="px-4 py-2 font-semibold">{children}</th>
    ),
    td: ({ children }: any) => (
      <td className="px-4 py-2 align-top">{children}</td>
    ),

    // --- 水平線 ---
    hr: () => (
      <hr className="my-6 border-border" />
    ),

    // --- 画像 ---
    img: ({ node, ...props }: any) => {
      // 画像のインデックスを取得（imagesの中から該当するものを検索）
      const src = props.src;
      const fullSrc = src?.startsWith('/api/files/') || src?.startsWith('http') 
        ? src 
        : `/api/files/${src}`;
      const index = images.findIndex(img => img.src === fullSrc);
      
      return (
        <MediaRenderer 
          src={props.src} 
          alt={props.alt}
          imageIndex={index !== -1 ? index : undefined}
          onImageClick={index !== -1 ? handleImageClick : undefined}
          isFullSize={isFullSizeImages}
        />
      );
    },

    // --- リンク ---
    a: ({ node, href, children, className, ...props }: any) => {
      // Wikiリンクの場合（remark-wiki-linkが付与するクラス）
      const isWikiLink = className?.includes('internal');
      const isNewWikiLink = className?.includes('new');
      
      if (isWikiLink) {
        return (
          <a
            href={href}
            className={isNewWikiLink 
              ? 'text-orange-500 hover:text-orange-600 hover:underline cursor-pointer' 
              : 'text-blue-500 hover:text-blue-600 hover:underline cursor-pointer'
            }
            {...props}
          >
            {children}
          </a>
        );
      }
      
      // 外部リンクの場合はプレビューを表示
      const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
      
      return (
        <>
          <a
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer"
            {...props}
          >
            {children}
          </a>
          {isExternal && <LinkPreview href={href} />}
        </>
      );
    },

    // --- チェックボックス（GFM） ---
    input: ({ type, checked, ...props }: any) => {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={checked}
            disabled
            className="mr-2 rounded border-border"
            {...props}
          />
        );
      }
      return <input type={type} {...props} />;
    },
  }), [permalinks, images, handleImageClick, isFullSizeImages]);

  // remarkWikiLink の設定
  const wikiLinkOptions = useMemo(() => ({
    permalinks: Object.keys(permalinks),
    pageResolver: (name: string) => [name],
    hrefTemplate: (permalink: string) => {
      const id = permalinks[permalink];
      return id ? `/notes/${id}` : `/notes/new?title=${encodeURIComponent(permalink)}`;
    },
    wikiLinkClassName: 'internal wiki-link',
    newClassName: 'new',
    aliasDivider: '|',
  }), [permalinks]);

  if (!content) {
    return <p className="text-muted-foreground">プレビューする内容がありません</p>;
  }

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, [remarkWikiLink, wikiLinkOptions]]}
        components={markdownComponents}
        unwrapDisallowed={true}
      >
        {content}
      </ReactMarkdown>
      
      {/* 画像ギャラリーモーダル */}
      <ImageGalleryModal
        images={images}
        initialIndex={galleryIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </>
  );
}
