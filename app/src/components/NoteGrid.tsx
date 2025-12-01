'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Link as LinkIcon, Twitter } from 'lucide-react';

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

// コンテンツから最初の外部リンクを抽出（YouTube, Twitter/X除外）
function extractFirstExternalLink(content: string): string | null {
  // Markdownリンク形式: [text](url)
  const markdownLinkPattern = /\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let match = markdownLinkPattern.exec(content || '');
  if (match) {
    const url = match[1];
    // YouTube, Twitter/Xは除外（これらは別の処理をする）
    if (!url.includes('youtube.com') && !url.includes('youtu.be') && 
        !url.includes('twitter.com') && !url.includes('x.com')) {
      return url;
    }
  }
  
  // プレーンURL形式
  const plainUrlPattern = /(?<!\]\()https?:\/\/[^\s<>\[\]]+/g;
  while ((match = plainUrlPattern.exec(content || '')) !== null) {
    const url = match[0];
    if (!url.includes('youtube.com') && !url.includes('youtu.be') && 
        !url.includes('twitter.com') && !url.includes('x.com')) {
      return url;
    }
  }
  
  return null;
}

// YouTubeのサムネイルURLを取得
function extractYouTubeThumbnail(content: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
    }
  }
  return null;
}

// Twitter/XのツイートIDを抽出
function extractTweetId(content: string): string | null {
  const pattern = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;
  const match = content.match(pattern);
  return match ? match[1] : null;
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
  const youtubeThumbnail = !media ? extractYouTubeThumbnail(note.content) : null;
  const tweetId = !media && !youtubeThumbnail ? extractTweetId(note.content) : null;
  const externalLink = !media && !youtubeThumbnail && !tweetId ? extractFirstExternalLink(note.content) : null;
  
  const [ogpImage, setOgpImage] = useState<string | null>(null);
  const [tweetImage, setTweetImage] = useState<string | null>(null);
  const [ogpLoading, setOgpLoading] = useState(false);
  
  // OGP画像を取得
  useEffect(() => {
    if (!externalLink) return;
    
    setOgpLoading(true);
    fetch(`/api/ogp?url=${encodeURIComponent(externalLink)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.image) {
          setOgpImage(data.image);
        }
      })
      .catch(() => {})
      .finally(() => setOgpLoading(false));
  }, [externalLink]);

  // Twitterの画像を取得
  useEffect(() => {
    if (!tweetId) return;
    
    fetch(`/api/tweet?id=${tweetId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.image) {
          setTweetImage(data.image);
        }
      })
      .catch(() => {});
  }, [tweetId]);
  
  const hasMedia = media !== null;
  const hasThumbnail = hasMedia || youtubeThumbnail || tweetImage || ogpImage;
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
      {/* 添付ファイル（画像/動画） */}
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
      
      {/* YouTubeサムネイル */}
      {!hasMedia && youtubeThumbnail && (
        <div className="relative aspect-video overflow-hidden bg-muted">
          <img
            src={youtubeThumbnail}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).parentElement!.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-red-600 rounded-lg px-2 py-1">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
        </div>
      )}
      
      {/* Twitter/X サムネイル */}
      {!hasMedia && !youtubeThumbnail && tweetImage && (
        <div className="relative aspect-video overflow-hidden bg-muted">
          <img
            src={tweetImage}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).parentElement!.style.display = 'none';
            }}
          />
          <div className="absolute bottom-2 right-2 pointer-events-none">
            <div className="bg-black rounded-full p-1">
              <svg viewBox="0 0 24 24" className="w-3 h-3 text-white fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
          </div>
        </div>
      )}
      
      {/* OGP画像 */}
      {!hasMedia && !youtubeThumbnail && !tweetImage && ogpImage && (
        <div className="relative aspect-video overflow-hidden bg-muted">
          <img
            src={ogpImage}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).parentElement!.style.display = 'none';
            }}
          />
          <div className="absolute bottom-2 right-2 pointer-events-none">
            <div className="bg-black/50 rounded p-1">
              <LinkIcon className="w-3 h-3 text-white" />
            </div>
          </div>
        </div>
      )}
      
      <CardHeader className={hasThumbnail ? "pb-1.5 pt-2.5 px-3" : "pb-1.5 px-3"}>
        <CardTitle className="line-clamp-1 text-sm font-medium">
          {note.title || '無題'}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {/* メディアがある場合は本文を省略 */}
        {!hasThumbnail && (
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
