'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import Link from 'next/link';
import { Note } from '@/lib/types';
import { fetchNotesPage, togglePin, toggleArchive, deleteNote, duplicateNote } from '@/actions/note';
import { formatDateJST, stripMarkdown } from '@/lib/utils';
import { extractYouTubeThumbnail, extractTweetId, extractFirstExternalLink } from '@/lib/media-utils';
import { extractFirstMedia } from '@/lib/file-utils';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Play, Link as LinkIcon, Loader2, MoreVertical, Pin, Trash2, Archive, ArchiveRestore, Copy } from 'lucide-react';

interface NoteGridProps {
  // 従来の静的表示用（ピン留めセクションなど）
  notes?: Note[];
  // 無限スクロール用
  initialNotes?: Note[];
  initialCursor?: string | null;
  initialHasMore?: boolean;
  tag?: string;
  search?: string;
  includeArchived?: boolean;
  // 親コンポーネントへのコールバック（ピン留めセクション連動用）
  onNoteUpdate?: (note: Note) => void;
  onNoteDelete?: (noteId: string) => void;
  onNoteArchive?: (noteId: string, isArchived: boolean) => void;
  onNoteDuplicate?: (note: Note) => void;
}

export function NoteGrid({ 
  notes,
  initialNotes,
  initialCursor,
  initialHasMore = false,
  tag,
  search,
  includeArchived = false,
  onNoteUpdate,
  onNoteDelete,
  onNoteArchive,
  onNoteDuplicate,
}: NoteGridProps) {
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
      const result = await fetchNotesPage(cursor, 20, tag, search, includeArchived);
      setDisplayNotes(prev => [...prev, ...result.notes]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isInfiniteMode, isLoading, hasMore, cursor, tag, search, includeArchived]);
  
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
  // notes（静的モード）の変更も監視
  useEffect(() => {
    if (notes) {
      // 静的モード：notes が変わったら displayNotes を更新
      setDisplayNotes(notes);
    } else if (initialNotes) {
      // 無限スクロールモード
      setDisplayNotes(initialNotes);
      setCursor(initialCursor || null);
      setHasMore(initialHasMore);
    }
  }, [notes, initialNotes, initialCursor, initialHasMore]);

  // ノートの更新（ピン留め切り替え時）
  const handleNoteUpdate = useCallback((updatedNote: Note) => {
    setDisplayNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    // 親コンポーネントにも通知（ピン留めセクション連動）
    onNoteUpdate?.(updatedNote);
  }, [onNoteUpdate]);

  // ノートの削除
  const handleNoteDelete = useCallback((noteId: string) => {
    setDisplayNotes(prev => prev.filter(n => n.id !== noteId));
    // 親コンポーネントにも通知
    onNoteDelete?.(noteId);
  }, [onNoteDelete]);

  // アーカイブ切り替え
  const handleNoteArchive = useCallback((noteId: string, isArchived: boolean) => {
    if (isArchived && !includeArchived) {
      // アーカイブされた場合、リストから削除
      setDisplayNotes(prev => prev.filter(n => n.id !== noteId));
    } else {
      // 復元された場合、または includeArchived=true の場合は更新
      setDisplayNotes(prev => prev.map(n => n.id === noteId ? { ...n, isArchived } : n));
    }
    // 親コンポーネントにも通知
    onNoteArchive?.(noteId, isArchived);
  }, [includeArchived, onNoteArchive]);

  // ノートの複製
  const handleNoteDuplicate = useCallback((newNote: Note) => {
    setDisplayNotes(prev => [newNote, ...prev]);
    onNoteDuplicate?.(newNote);
  }, [onNoteDuplicate]);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {displayNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onUpdate={handleNoteUpdate}
            onDelete={handleNoteDelete}
            onArchive={handleNoteArchive}
            onDuplicate={handleNoteDuplicate}
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

function NoteCard({ 
  note, 
  onUpdate,
  onDelete,
  onArchive,
  onDuplicate,
}: { 
  note: Note; 
  onUpdate?: (note: Note) => void;
  onDelete?: (noteId: string) => void;
  onArchive?: (noteId: string, isArchived: boolean) => void;
  onDuplicate?: (note: Note) => void;
}) {
  const media = extractFirstMedia(note.content, note.images || []);
  const youtubeThumbnail = !media ? extractYouTubeThumbnail(note.content) : null;
  const tweetId = !media && !youtubeThumbnail ? extractTweetId(note.content) : null;
  const externalLink = !media && !youtubeThumbnail && !tweetId ? extractFirstExternalLink(note.content) : null;
  
  const [ogpImage, setOgpImage] = useState<string | null>(null);
  const [tweetImage, setTweetImage] = useState<string | null>(null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
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
  const excerpt = stripMarkdown(note.content || '').slice(0, 200);

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

  // ピン留め切り替え
  const handleTogglePin = async (e: React.MouseEvent) => {
    e.preventDefault(); // リンクのナビゲーションを防止
    e.stopPropagation();
    try {
      const updated = await togglePin(note.id);
      onUpdate?.(updated);
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  // 削除
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // リンクのナビゲーションを防止
    e.stopPropagation();
    if (!confirm('このメモを削除しますか？')) return;
    try {
      await deleteNote(note.id);
      onDelete?.(note.id);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  // アーカイブ切り替え
  const handleToggleArchive = async (e: React.MouseEvent) => {
    e.preventDefault(); // リンクのナビゲーションを防止
    e.stopPropagation();
    try {
      const updated = await toggleArchive(note.id);
      onArchive?.(note.id, updated.isArchived);
    } catch (error) {
      console.error('Failed to toggle archive:', error);
    }
  };

  // 複製
  const handleDuplicate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const newNote = await duplicateNote(note.id);
      onDuplicate?.(newNote);
    } catch (error) {
      console.error('Failed to duplicate note:', error);
    }
  };

  return (
    <Link href={`/notes/${note.id}`} className="block h-full">
      <Card className="cursor-pointer transition-all hover:border-foreground/20 group overflow-hidden h-full flex flex-col">
        {/* ヘッダー: タイトル + ステータス + メニュー */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <h3 
            className="flex-1 min-w-0 line-clamp-1 text-sm font-medium"
            title={note.title || '無題'}
          >
            {note.title || '無題'}
          </h3>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {note.isPinned && (
              <div className="p-1 rounded-md bg-primary text-primary-foreground">
                <Pin className="h-3 w-3 fill-current" />
              </div>
            )}
            {note.isArchived && (
              <div className="p-1 rounded-md bg-muted text-muted-foreground">
                <Archive className="h-3 w-3" />
              </div>
            )}
            
            {/* コンテキストメニュー */}
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={handleTogglePin}>
                  <Pin className={`h-4 w-4 mr-2 ${note.isPinned ? 'fill-current' : ''}`} />
                  {note.isPinned ? 'ピン解除' : 'ピン留め'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleToggleArchive}>
                  {note.isArchived ? (
                    <>
                      <ArchiveRestore className="h-4 w-4 mr-2" />
                      復元
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4 mr-2" />
                      アーカイブ
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  複製
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
        </div>

        {/* コンテンツエリア: サムネイル or 本文（固定高さ） */}
        <div className="flex-1 px-3">
          {hasThumbnail ? (
            <div className="relative h-32 overflow-hidden bg-muted rounded-md">
              {hasMedia && media.type === 'video' ? (
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
              ) : hasMedia ? (
                <img
                  src={`/api/files/${media.filename}`}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : youtubeThumbnail ? (
                <>
                  <img
                    src={youtubeThumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-red-600 rounded-lg px-2 py-1">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                  </div>
                </>
              ) : tweetImage ? (
                <>
                  <img
                    src={tweetImage}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute bottom-2 right-2 pointer-events-none">
                    <div className="bg-black rounded-full p-1">
                      <svg viewBox="0 0 24 24" className="w-3 h-3 text-white fill-current">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </div>
                  </div>
                </>
              ) : ogpImage ? (
                <>
                  <img
                    src={ogpImage}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute bottom-2 right-2 pointer-events-none">
                    <div className="bg-black/50 rounded p-1">
                      <LinkIcon className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-[8] h-32 overflow-hidden">
              {excerpt || 'メモがありません'}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}

// パフォーマンス最適化: React.memo でラップ
const MemoizedNoteCard = memo(NoteCard);
export { MemoizedNoteCard as NoteCard };
