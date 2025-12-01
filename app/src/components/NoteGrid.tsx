'use client';

import { useRouter } from 'next/navigation';
import { Note } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// 日付を一貫したフォーマットで表示（SSR/CSRの不一致を防ぐ）
// UTCベースで計算し、タイムゾーンに依存しない
function formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  // JSTはUTC+9なので、9時間足した値で計算
  const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jstDate.getUTCFullYear()}/${jstDate.getUTCMonth() + 1}/${jstDate.getUTCDate()}`;
}

// Markdown記号を除去してプレーンテキストに
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')
    .replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '')
    .trim();
}

export function NoteGrid({ notes }: { notes: Note[] }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onClick={() => router.push(`/notes/${note.id}`)}
        />
      ))}
    </div>
  );
}

function NoteCard({ note, onClick }: { note: Note; onClick: () => void }) {
  const hasImages = note.images && note.images.length > 0;
  const thumbnailUrl = hasImages ? `/api/files/${note.images[0]}` : null;
  const excerpt = stripMarkdown(note.content || '').slice(0, 100);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      {thumbnailUrl && (
        <div className="relative h-32 overflow-hidden rounded-t-xl bg-muted">
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="line-clamp-1 text-base">
          {note.title || '無題'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {excerpt || 'メモがありません'}
        </p>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDate(note.updatedAt)}</span>
          {note.tags && note.tags.length > 0 && (
            <span className="truncate ml-2">#{note.tags.join(' #')}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
