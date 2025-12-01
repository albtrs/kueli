'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { fetchNotes } from '@/actions/note';
import { Note } from '@/lib/types';
import { FileText, Pin, Tag, Paperclip, Menu, X } from 'lucide-react';

interface TagViewRecord {
  id: string;
  name: string;
  count: number;
}

export function Sidebar() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [tags, setTags] = useState<TagViewRecord[]>([]);
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchData();
    } else if (status === 'unauthenticated') {
      setIsLoading(false);
    }
  }, [status]);

  const fetchData = async () => {
    try {
      // 全ノートからタグをリアルタイム集計
      try {
        const allNotes = await fetchNotes();
        
        const tagCounts = new Map<string, number>();
        allNotes.forEach(note => {
          if (note.tags && Array.isArray(note.tags)) {
            note.tags.forEach(tag => {
              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
          }
        });
        
        const tagsArray: TagViewRecord[] = Array.from(tagCounts.entries())
          .map(([name, count], index) => ({
            id: `tag_${index}`,
            name,
            count
          }))
          .sort((a, b) => b.count - a.count);
        
        setTags(tagsArray);
        
        // ピン留めノートをフィルタ
        const pinned = allNotes.filter(note => note.isPinned);
        setPinnedNotes(pinned);
      } catch (err) {
        console.log('Failed to fetch notes:', err);
      }
      
    } catch (err) {
      console.error('Failed to fetch sidebar data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTagClick = (tagName: string) => {
    // タグでフィルタリングした一覧ページへ遷移（実装は後で）
    router.push(`/?tag=${encodeURIComponent(tagName)}`);
  };

  if (isLoading) {
    return (
      <>
        {/* モバイル用ハンバーガーボタン */}
        <button
          className="fixed top-3 left-3 z-50 p-2 bg-background border rounded md:hidden"
          onClick={() => setIsMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <aside className="hidden md:flex w-56 border-r bg-background p-4">
          <div className="text-sm text-muted-foreground">読み込み中...</div>
        </aside>
      </>
    );
  }

  const sidebarContent = (
    <>
      {/* ピン留めセクション */}
      {pinnedNotes.length > 0 && (
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Pin className="h-3 w-3" />
            ピン留め
          </div>
          <div className="space-y-0.5">
            {pinnedNotes.map(note => (
              <div
                key={note.id}
                className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted rounded cursor-pointer"
                onClick={() => {
                  router.push(`/notes/${note.id}`);
                  setIsMobileOpen(false);
                }}
              >
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate">{note.title || '無題'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* タグセクション */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Tag className="h-3 w-3" />
          タグ
        </div>
        {tags.length === 0 ? (
          <div className="text-xs text-muted-foreground">タグはありません</div>
        ) : (
          <div className="space-y-0.5">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="flex items-center justify-between py-1.5 px-2 hover:bg-muted rounded cursor-pointer"
                onClick={() => {
                  handleTagClick(tag.name);
                  setIsMobileOpen(false);
                }}
              >
                <span className="text-sm">#{tag.name}</span>
                <span className="text-xs text-muted-foreground">{tag.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添付ファイル管理リンク */}
      <div className="p-3 border-t">
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted rounded cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={() => {
            router.push('/attachments');
            setIsMobileOpen(false);
          }}
        >
          <Paperclip className="h-4 w-4" />
          <span className="text-sm">添付ファイル</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* モバイル用ハンバーガーボタン */}
      <button
        className="fixed top-3 left-3 z-50 p-2 bg-background border rounded md:hidden"
        onClick={() => setIsMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* モバイル用オーバーレイ */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* モバイル用サイドバー */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-background border-r transform transition-transform duration-200 md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-semibold">メニュー</span>
          <button onClick={() => setIsMobileOpen(false)} className="p-1 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col h-[calc(100%-49px)]">
          {sidebarContent}
        </div>
      </aside>

      {/* デスクトップ用サイドバー */}
      <aside className="hidden md:flex md:flex-col w-56 border-r bg-background">
        {sidebarContent}
      </aside>
    </>
  );
}
