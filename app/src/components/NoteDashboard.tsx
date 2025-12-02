'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/types';
import { NoteGrid } from '@/components/NoteGrid';
import { FileText, Pin, Clock } from 'lucide-react';

interface NoteDashboardProps {
  initialPinnedNotes: Note[];
  initialNotes: Note[];
  initialCursor: string | null;
  initialHasMore: boolean;
  tag?: string;
  search?: string;
}

export function NoteDashboard({
  initialPinnedNotes,
  initialNotes,
  initialCursor,
  initialHasMore,
  tag,
  search,
}: NoteDashboardProps) {
  const router = useRouter();
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>(initialPinnedNotes);
  const [recentNotes, setRecentNotes] = useState<Note[]>(initialNotes);

  // ノートの更新（ピン留め切り替え時）
  const handleNoteUpdate = useCallback((updatedNote: Note) => {
    if (updatedNote.isPinned) {
      // ピン留めされた場合
      // 最近更新リストから削除せず、ピン留めリストに追加
      setPinnedNotes(prev => {
        // 既に存在する場合は更新、なければ追加
        const exists = prev.some(n => n.id === updatedNote.id);
        if (exists) {
          return prev.map(n => n.id === updatedNote.id ? updatedNote : n);
        }
        return [updatedNote, ...prev];
      });
      // 最近更新リストも更新（ピンアイコン表示のため）
      setRecentNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    } else {
      // ピン解除された場合
      // ピン留めリストから削除
      setPinnedNotes(prev => prev.filter(n => n.id !== updatedNote.id));
      // 最近更新リストを更新
      setRecentNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    }
  }, []);

  // ノートの削除
  const handleNoteDelete = useCallback((noteId: string) => {
    setPinnedNotes(prev => prev.filter(n => n.id !== noteId));
    setRecentNotes(prev => prev.filter(n => n.id !== noteId));
  }, []);

  return (
    <>
      {/* ピン留めセクション */}
      {pinnedNotes.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Pin className="h-4 w-4" /> ピン留め
          </h2>
          <NoteGrid 
            notes={pinnedNotes}
            onNoteUpdate={handleNoteUpdate}
            onNoteDelete={handleNoteDelete}
          />
        </section>
      )}

      {/* 最近のメモセクション（無限スクロール対応） */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" /> 最近更新
        </h2>
        {recentNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">メモがありません</p>
          </div>
        ) : (
          <NoteGrid 
            initialNotes={recentNotes}
            initialCursor={initialCursor}
            initialHasMore={initialHasMore}
            tag={tag}
            search={search}
            onNoteUpdate={handleNoteUpdate}
            onNoteDelete={handleNoteDelete}
          />
        )}
      </section>
    </>
  );
}
