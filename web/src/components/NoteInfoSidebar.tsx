'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, List, Link2 } from 'lucide-react';
import { TableOfContents } from './TableOfContents';
import { Backlinks } from './Backlinks';

interface NoteInfoSidebarProps {
  /** Markdownコンテンツ（目次生成用） */
  content: string;
  /** ノートID（バックリンク取得用、新規ノートの場合はundefined） */
  noteId?: string;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * 折りたたみ可能なセクション
 */
function CollapsibleSection({ title, icon, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        {icon}
        <span>{title}</span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * ノート情報サイドバー
 * 目次とバックリンクを表示
 */
export function NoteInfoSidebar({ content, noteId }: NoteInfoSidebarProps) {
  return (
    <aside className="h-full overflow-y-auto">
      {/* 目次セクション */}
      <CollapsibleSection
        title="目次"
        icon={<List className="h-4 w-4 text-muted-foreground" />}
        defaultOpen={true}
      >
        <TableOfContents content={content} maxDepth={3} />
      </CollapsibleSection>

      {/* バックリンクセクション */}
      {noteId && (
        <CollapsibleSection
          title="リンク元"
          icon={<Link2 className="h-4 w-4 text-muted-foreground" />}
          defaultOpen={true}
        >
          <Backlinks noteId={noteId} />
        </CollapsibleSection>
      )}
    </aside>
  );
}
