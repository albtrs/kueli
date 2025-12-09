'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Link2, Loader2 } from 'lucide-react';
import { fetchBacklinks } from '@/actions/note';
import { Note } from '@/lib/types';

interface BacklinksProps {
  /** 対象ノートのID */
  noteId: string;
}

/**
 * バックリンクコンポーネント
 * 指定されたノートをWikiLinkでリンクしているノートの一覧を表示
 */
export function Backlinks({ noteId }: BacklinksProps) {
  const [backlinks, setBacklinks] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBacklinks = async () => {
      if (!noteId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const links = await fetchBacklinks(noteId);
        setBacklinks(links);
      } catch (e) {
        console.error('Failed to fetch backlinks:', e);
        setError('バックリンクの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadBacklinks();
  }, [noteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (backlinks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        リンクしている記事はありません
      </div>
    );
  }

  return (
    <ul className="space-y-1 list-disc list-inside">
      {backlinks.map((note) => (
        <li key={note.id} className="text-sm text-muted-foreground">
          <Link
            href={`/notes/${note.id}`}
            className="hover:text-foreground transition-colors"
            title={note.title}
          >
            {note.title || '無題のノート'}
          </Link>
        </li>
      ))}
    </ul>
  );
}
