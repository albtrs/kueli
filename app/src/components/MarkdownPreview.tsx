'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkWikiLink from 'remark-wiki-link';
import { MediaRenderer } from './MediaRenderer';
import { LinkPreview } from './LinkPreview';

interface MarkdownPreviewProps {
  content: string;
  permalinks: Record<string, string>;
}

/**
 * Markdownプレビューコンポーネント
 */
export function MarkdownPreview({ content, permalinks }: MarkdownPreviewProps) {
  // カスタムMarkdownレンダラー
  const markdownComponents: any = useMemo(() => ({
    img: ({ node, ...props }: any) => (
      <MediaRenderer src={props.src} alt={props.alt} />
    ),
    a: ({ node, href, children, className, ...props }: any) => {
      // Wikiリンクの場合（remark-wiki-linkが付与するクラス）
      const isWikiLink = className?.includes('internal');
      const isNewWikiLink = className?.includes('new');
      
      if (isWikiLink) {
        return (
          <a
            href={href}
            className={isNewWikiLink ? 'wiki-link-new' : 'wiki-link'}
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
            {...props}
          >
            {children}
          </a>
          {isExternal && <LinkPreview href={href} />}
        </>
      );
    },
  }), []);

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
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkWikiLink, wikiLinkOptions]]}
      components={markdownComponents}
      unwrapDisallowed={true}
    >
      {content}
    </ReactMarkdown>
  );
}
