'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getNotes, saveNote } from '@/actions/note';
import { Note } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FileText, Pin, Plus, Tag, Paperclip } from 'lucide-react';

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
  const [isCreating, setIsCreating] = useState(false);

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
        const allNotes = await getNotes();
        
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

  const handleCreateNote = async () => {
    setIsCreating(true);
    try {
      const newNote = await saveNote(null, {
        title: '無題のメモ',
        content: '',
        isPinned: false,
        tags: [],
      });
      router.push(`/notes/${newNote.id}`);
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleTagClick = (tagName: string) => {
    // タグでフィルタリングした一覧ページへ遷移（実装は後で）
    router.push(`/?tag=${encodeURIComponent(tagName)}`);
  };

  if (isLoading) {
    return (
      <aside className="w-64 border-r bg-background p-4">
        <div className="text-sm text-muted-foreground">読み込み中...</div>
      </aside>
    );
  }

  return (
    <aside className="w-64 border-r bg-background flex flex-col">
      {/* ヘッダー */}
      <div className="p-4 border-b">
        <Button onClick={handleCreateNote} className="w-full" size="sm" disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          新規メモ
        </Button>
      </div>

      {/* ピン留めセクション */}
      {pinnedNotes.length > 0 && (
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
            <Pin className="h-3 w-3" />
            ピン留め
          </div>
          <div className="space-y-1">
            {pinnedNotes.map(note => (
              <div
                key={note.id}
                className="flex items-center gap-2 py-1 px-2 hover:bg-muted rounded-md cursor-pointer"
                onClick={() => router.push(`/notes/${note.id}`)}
              >
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate">{note.title || '無題'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* タグセクション */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
          <Tag className="h-3 w-3" />
          タグ
        </div>
        {tags.length === 0 ? (
          <div className="text-xs text-muted-foreground">タグはありません</div>
        ) : (
          <div className="space-y-1">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="flex items-center justify-between py-1 px-2 hover:bg-muted rounded-md cursor-pointer group"
                onClick={() => handleTagClick(tag.name)}
              >
                <span className="text-sm">#{tag.name}</span>
                <span className="text-xs text-muted-foreground">{tag.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添付ファイル管理リンク */}
      <div className="p-4 border-t">
        <div
          className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={() => router.push('/attachments')}
        >
          <Paperclip className="h-4 w-4" />
          <span className="text-sm">添付ファイル管理</span>
        </div>
      </div>
    </aside>
  );
}
