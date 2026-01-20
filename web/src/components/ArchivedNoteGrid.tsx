'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import type { Note } from '@/lib/types';
import { fetchNotesPage, toggleArchive, deleteNote } from '@/api/notes';
import { formatDateJST, stripMarkdown } from '@/lib/utils';
import { extractYouTubeThumbnail, extractTweetId, extractFirstExternalLink } from '@/lib/media-utils';
import { extractFirstMedia } from '@/lib/file-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Play, Link as LinkIcon, Loader2, MoreVertical, Trash2, ArchiveRestore, FileText } from 'lucide-react';

interface ArchivedNoteGridProps {
  initialNotes: Note[];
  initialCursor: string | null;
  initialHasMore: boolean;
}

export function ArchivedNoteGrid({
  initialNotes,
  initialCursor,
  initialHasMore,
}: ArchivedNoteGridProps) {
  const [displayNotes, setDisplayNotes] = useState<Note[]>(initialNotes);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // propsが変更されたらstateを更新
  useEffect(() => {
    setDisplayNotes(initialNotes);
    setCursor(initialCursor);
    setHasMore(initialHasMore);
  }, [initialNotes, initialCursor, initialHasMore]);

  // 追加読み込み（アーカイブのみ）
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const result = await fetchNotesPage(cursor, 20, undefined, undefined, true);
      // アーカイブされたノートのみをフィルタ
      const archivedNotes = result.notes.filter(note => note.isArchived);
      setDisplayNotes(prev => [...prev, ...archivedNotes]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more archived notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, cursor]);

  // Intersection Observer で自動読み込み
  useEffect(() => {
    if (!hasMore) return;

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
  }, [hasMore, isLoading, loadMore]);

  // ノート復元時にリストから削除
  const handleRestore = useCallback((noteId: string) => {
    setDisplayNotes(prev => prev.filter(n => n.id !== noteId));
  }, []);

  // ノート削除
  const handleDelete = useCallback((noteId: string) => {
    setDisplayNotes(prev => prev.filter(n => n.id !== noteId));
  }, []);

  if (displayNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">アーカイブされたメモはありません</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {displayNotes.map((note) => (
          <ArchivedNoteCard
            key={note.id}
            note={note}
            onRestore={handleRestore}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* 無限スクロールのトリガー要素 */}
      {hasMore && (
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

function ArchivedNoteCard({
  note,
  onRestore,
  onDelete,
}: {
  note: Note;
  onRestore: (noteId: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const media = extractFirstMedia(note.content, note.images || []);
  const youtubeThumbnail = !media ? extractYouTubeThumbnail(note.content) : null;
  const tweetId = !media && !youtubeThumbnail ? extractTweetId(note.content) : null;
  const externalLink = !media && !youtubeThumbnail && !tweetId ? extractFirstExternalLink(note.content) : null;

  const [ogpImage, setOgpImage] = useState<string | null>(null);
  const [tweetImage, setTweetImage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // OGP画像を取得
  useEffect(() => {
    if (!externalLink) return;

    fetch(`/api/ogp?url=${encodeURIComponent(externalLink)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.image) {
          setOgpImage(data.image);
        }
      })
      .catch(() => {});
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
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  };

  // 復元（アーカイブ解除）
  const handleRestore = async (e: React.MouseEvent) => {
    e.preventDefault(); // リンクのナビゲーションを防止
    e.stopPropagation();
    try {
      await toggleArchive(note.id);
      onRestore(note.id);
    } catch (error) {
      console.error('Failed to restore note:', error);
    }
  };

  // 削除
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // リンクのナビゲーションを防止
    e.stopPropagation();
    if (!confirm('このメモを完全に削除しますか？この操作は取り消せません。')) return;
    try {
      await deleteNote(note.id);
      onDelete(note.id);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  return (
    <Link to={`/notes/${note.id}`} className="block">
      <Card
        className="cursor-pointer transition-all hover:border-foreground/20 group overflow-hidden relative opacity-75 hover:opacity-100 h-full"
      >
      {/* コンテキストメニュー */}
      <div className="absolute top-1.5 right-1.5 z-10">
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={`p-1.5 rounded-md bg-background/80 backdrop-blur-sm border border-border/50 transition-opacity ${
                isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              onClick={(e) => {
                e.preventDefault(); // リンクのナビゲーションを防止
                e.stopPropagation();
              }}
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={handleRestore}>
              <ArchiveRestore className="h-4 w-4 mr-2" />
              戻す
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

      <CardHeader className={hasThumbnail ? 'pb-1.5 pt-2.5 px-3' : 'pb-1.5 px-3'}>
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
            <span className="truncate ml-2 text-[10px]">
              #{note.tags[0]}
              {note.tags.length > 1 && ` +${note.tags.length - 1}`}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
    </Link>
  );
}

const MemoizedArchivedNoteCard = memo(ArchivedNoteCard);
export { MemoizedArchivedNoteCard as ArchivedNoteCard };
