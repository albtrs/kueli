'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Note } from '@/lib/types';
import { NoteGrid } from '@/components/NoteGrid';
import { FileText, Pin, Clock, ArrowDown, ArrowUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NoteDashboardProps {
  initialPinnedNotes: Note[];
  initialNotes: Note[];
  initialCursor: string | null;
  initialHasMore: boolean;
  tag?: string;
  search?: string;
  sortOrder: 'desc' | 'asc';
  isSearchMode: boolean;
}

export function NoteDashboard({
  initialPinnedNotes,
  initialNotes,
  initialCursor,
  initialHasMore,
  tag,
  search,
  sortOrder,
  isSearchMode,
}: NoteDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>(initialPinnedNotes);
  const [recentNotes, setRecentNotes] = useState<Note[]>(initialNotes);

  // propsが変更されたらstateを更新
  useEffect(() => {
    setPinnedNotes(initialPinnedNotes);
  }, [initialPinnedNotes]);

  useEffect(() => {
    setRecentNotes(initialNotes);
  }, [initialNotes]);

  // ソート順切り替え（URLパラメータを更新）
  const toggleSortOrder = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortOrder === 'desc') {
      params.set('sort', 'asc');
    } else {
      params.delete('sort'); // descはデフォルトなのでパラメータ不要
    }
    router.push(`/?${params.toString()}`);
  }, [router, searchParams, sortOrder]);

  // ノートの更新（ピン留め切り替え時）
  const handleNoteUpdate = useCallback((updatedNote: Note) => {
    if (updatedNote.isPinned) {
      // ピン留めされた場合
      // ピン留めリストに追加
      setPinnedNotes(prev => {
        const exists = prev.some(n => n.id === updatedNote.id);
        if (exists) {
          return prev.map(n => n.id === updatedNote.id ? updatedNote : n);
        }
        return [updatedNote, ...prev];
      });
      // 最近更新リストから削除（ピン留めセクションに移動するため）
      setRecentNotes(prev => prev.filter(n => n.id !== updatedNote.id));
    } else {
      // ピン解除された場合
      // ピン留めリストから削除
      setPinnedNotes(prev => prev.filter(n => n.id !== updatedNote.id));
      // 最近更新リストに追加（先頭に）
      setRecentNotes(prev => {
        const exists = prev.some(n => n.id === updatedNote.id);
        if (exists) {
          return prev.map(n => n.id === updatedNote.id ? updatedNote : n);
        }
        return [updatedNote, ...prev];
      });
    }
  }, []);

  // ノートの削除
  const handleNoteDelete = useCallback((noteId: string) => {
    setPinnedNotes(prev => prev.filter(n => n.id !== noteId));
    setRecentNotes(prev => prev.filter(n => n.id !== noteId));
  }, []);

  // アーカイブ時のハンドラ（アーカイブされたらリストから削除）
  const handleNoteArchive = useCallback((noteId: string, isArchived: boolean) => {
    if (isArchived) {
      // アーカイブされた場合、リストから削除
      setPinnedNotes(prev => prev.filter(n => n.id !== noteId));
      setRecentNotes(prev => prev.filter(n => n.id !== noteId));
    }
  }, []);

  return (
    <>
      {/* ピン留めセクション（検索モードでない場合のみ表示） */}
      {!isSearchMode && pinnedNotes.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Pin className="h-4 w-4" /> ピン留め
          </h2>
          <NoteGrid 
            notes={pinnedNotes}
            onNoteUpdate={handleNoteUpdate}
            onNoteDelete={handleNoteDelete}
            onNoteArchive={handleNoteArchive}
          />
        </section>
      )}

      {/* 最近のメモセクション / 検索結果セクション（無限スクロール対応） */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {isSearchMode ? (
              <>
                <Search className="h-4 w-4" /> 検索結果
              </>
            ) : (
              <>
                <Clock className="h-4 w-4" /> 最近の更新
              </>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSortOrder}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            title={sortOrder === 'desc' ? '新しい順' : '古い順'}
          >
            {sortOrder === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
            <span className="ml-1 text-xs">{sortOrder === 'desc' ? '新しい順' : '古い順'}</span>
          </Button>
        </div>
        {recentNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              {isSearchMode ? '検索結果がありません' : 'メモがありません'}
            </p>
          </div>
        ) : (
          <NoteGrid 
            key={sortOrder} // ソート順が変わったらリセット
            initialNotes={recentNotes}
            initialCursor={initialCursor}
            initialHasMore={initialHasMore}
            tag={tag}
            search={search}
            excludePinned={!isSearchMode} // 検索モードではピン留めも含める
            sortOrder={sortOrder}
            onNoteUpdate={handleNoteUpdate}
            onNoteDelete={handleNoteDelete}
            onNoteArchive={handleNoteArchive}
          />
        )}
      </section>
    </>
  );
}
