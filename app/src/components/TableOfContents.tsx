'use client';

import { useMemo } from 'react';
import { List } from 'lucide-react';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  /** Markdownコンテンツ */
  content: string;
  /** 目次の最大深さ（デフォルト3、h1〜h3まで） */
  maxDepth?: number;
}

/**
 * テキストからスラッグIDを生成
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-]/g, '');
}

/**
 * Markdownコンテンツから見出しを抽出
 */
function extractHeadings(content: string, maxDepth: number): Heading[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: Heading[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    if (level <= maxDepth) {
      const text = match[2].trim();
      const id = generateSlug(text);
      headings.push({ id, text, level });
    }
  }

  return headings;
}

/**
 * 目次コンポーネント
 * Markdownの見出しを解析してナビゲーションリンクを生成
 */
export function TableOfContents({ content, maxDepth = 3 }: TableOfContentsProps) {
  const headings = useMemo(() => extractHeadings(content, maxDepth), [content, maxDepth]);

  if (headings.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        見出しがありません
      </div>
    );
  }

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav className="space-y-1">
      {headings.map((heading, index) => (
        <button
          key={`${heading.id}-${index}`}
          onClick={() => handleClick(heading.id)}
          className="block w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
          style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}
          title={heading.text}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
}

/**
 * スラッグ生成関数をエクスポート（MarkdownPreviewで使用）
 */
export { generateSlug };
