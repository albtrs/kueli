'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/types';
import { fetchNotesPage } from '@/actions/note';
import { formatDateJST, stripMarkdown } from '@/lib/utils';
import { extractYouTubeThumbnail, extractTweetId, extractFirstExternalLink } from '@/lib/media-utils';
import { extractFirstMedia } from '@/lib/file-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Link as LinkIcon, Loader2 } from 'lucide-react';

interface NoteGridProps {
  // 従来の静的表示用（ピン留めセクションなど）
  notes?: Note[];
  // 無限スクロール用
  initialNotes?: Note[];
  initialCursor?: string | null;
  initialHasMore?: boolean;
  tag?: string;
  search?: string;
}

export function NoteGrid({ 
  notes,
  initialNotes,
  initialCursor,
  initialHasMore = false,
  tag,
  search,
}: NoteGridProps) {
  const router = useRouter();
  
  // 無限スクロールモードかどうか
  const isInfiniteMode = initialNotes !== undefined;
  
  // 無限スクロール用の状態
  const [displayNotes, setDisplayNotes] = useState<Note[]>(initialNotes || notes || []);
  const [cursor, setCursor] = useState<string | null>(initialCursor || null);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  
  // Intersection Observer 用の ref
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // 追加読み込み
  const loadMore = useCallback(async () => {
    if (!isInfiniteMode || isLoading || !hasMore) return;
    
    setIsLoading(true);
    try {
      const result = await fetchNotesPage(cursor, 20, tag, search);
      setDisplayNotes(prev => [...prev, ...result.notes]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isInfiniteMode, isLoading, hasMore, cursor, tag, search]);
  
  // Intersection Observer で自動読み込み
  useEffect(() => {
    if (!isInfiniteMode || !hasMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    
    return () => observer.disconnect();
  }, [isInfiniteMode, hasMore, isLoading, loadMore]);
  
  // タグや検索が変わったらリセット（page.tsx 側で initialNotes が変わる）
  useEffect(() => {
    if (initialNotes) {
      setDisplayNotes(initialNotes);
      setCursor(initialCursor || null);
      setHasMore(initialHasMore);
    }
  }, [initialNotes, initialCursor, initialHasMore]);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {displayNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onClick={() => router.push(`/notes/${note.id}`)}
          />
        ))}
      </div>
      
      {/* 無限スクロールのトリガー要素 */}
      {isInfiniteMode && hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">読み込み中...</span>
            </div>
          ) : (
            <div className="h-8" />
          )}
        </div>
      )}
    </>
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
          <span>{formatDateJST(note.updatedAt)}</span>
          {note.tags && note.tags.length > 0 && (
            <span className="truncate ml-2 text-[10px]">#{note.tags[0]}{note.tags.length > 1 && ` +${note.tags.length - 1}`}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// パフォーマンス最適化: React.memo でラップ
const MemoizedNoteCard = memo(NoteCard);
export { MemoizedNoteCard as NoteCard };
