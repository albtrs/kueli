'use client';

import { useRouter } from 'next/navigation';
import { Note } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play } from 'lucide-react';

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

// ファイルの種類を判定
function getFileType(filename: string): 'image' | 'video' | 'other' {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';
  if (['mp4', 'webm', 'mov'].includes(ext || '')) return 'video';
  return 'other';
}

// コンテンツから最初のメディアファイルを抽出
function extractFirstMedia(content: string, images: string[]): { filename: string; type: 'image' | 'video' } | null {
  // まずimagesフィールドから画像/動画を探す
  for (const filename of images) {
    const type = getFileType(filename);
    if (type === 'image' || type === 'video') {
      return { filename, type };
    }
  }
  
  // コンテンツ内のMarkdown画像/リンクから探す
  const markdownPattern = /!\[.*?\]\((?:\/api\/files\/)?([^)]+)\)/g;
  let match;
  while ((match = markdownPattern.exec(content || '')) !== null) {
    const filename = match[1];
    const type = getFileType(filename);
    if (type === 'image' || type === 'video') {
      return { filename, type };
    }
  }
  
  return null;
}

export function NoteGrid({ notes }: { notes: Note[] }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
  const media = extractFirstMedia(note.content, note.images || []);
  const hasMedia = media !== null;
  const excerpt = stripMarkdown(note.content || '').slice(0, 80);

  const handleVideoHover = (e: React.MouseEvent<HTMLVideoElement>, action: 'play' | 'pause') => {
    e.stopPropagation();
    const video = e.currentTarget;
    if (action === 'play') {
      video.play().catch(() => {}); // 自動再生がブロックされた場合のエラーを無視
    } else {
      video.pause();
      video.currentTime = 0;
    }
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:border-foreground/20 group overflow-hidden"
      onClick={onClick}
    >
      {hasMedia && (
        <div className="relative aspect-video overflow-hidden bg-muted">
          {media.type === 'video' ? (
            <>
              <video
                src={`/api/files/${media.filename}`}
                className="w-full h-full object-cover"
                preload="metadata"
                muted
                loop
                playsInline
                onMouseEnter={(e) => handleVideoHover(e, 'play')}
                onMouseLeave={(e) => handleVideoHover(e, 'pause')}
              />
              {/* 動画アイコン（ホバー時に非表示） */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity duration-200">
                <div className="bg-black/50 rounded p-2">
                  <Play className="w-5 h-5 text-white fill-white" />
                </div>
              </div>
            </>
          ) : (
            <img
              src={`/api/files/${media.filename}`}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
              }}
            />
          )}
        </div>
      )}
      <CardHeader className={hasMedia ? "pb-1.5 pt-2.5 px-3" : "pb-1.5 px-3"}>
        <CardTitle className="line-clamp-1 text-sm font-medium">
          {note.title || '無題'}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {/* メディアがある場合は本文を省略 */}
        {!hasMedia && (
          <p className="line-clamp-2 text-xs text-muted-foreground mb-2">
            {excerpt || 'メモがありません'}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDate(note.updatedAt)}</span>
          {note.tags && note.tags.length > 0 && (
            <span className="truncate ml-2 text-[10px]">#{note.tags[0]}{note.tags.length > 1 && ` +${note.tags.length - 1}`}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
