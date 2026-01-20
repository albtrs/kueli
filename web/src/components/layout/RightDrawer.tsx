'use client';

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchNotes } from '@/api/notes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Tag, X } from 'lucide-react';

interface TagRecord {
  id: string;
  name: string;
  count: number;
}

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RightDrawer({ isOpen, onClose }: RightDrawerProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentQuery = searchParams.get('q') || '';
  const selectedTag = searchParams.get('tag');
  
  const [searchQuery, setSearchQuery] = useState(currentQuery);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // タグを取得
  useEffect(() => {
    const loadTags = async () => {
      try {
        const allNotes = await fetchNotes();
        const tagCounts = new Map<string, number>();
        let untaggedCount = 0;
        
        allNotes.forEach(note => {
          if (note.tags && Array.isArray(note.tags) && note.tags.length > 0) {
            note.tags.forEach(tag => {
              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
          } else {
            untaggedCount++;
          }
        });
        
        const tagsArray: TagRecord[] = Array.from(tagCounts.entries())
          .map(([name, count], index) => ({
            id: `tag_${index}`,
            name,
            count
          }))
          .sort((a, b) => b.count - a.count);
        
        // 「タグなし」を最上部に追加
        if (untaggedCount > 0) {
          tagsArray.unshift({
            id: 'tag_untagged',
            name: '__untagged__',
            count: untaggedCount
          });
        }
        
        setTags(tagsArray);
      } catch (err) {
        console.error('Failed to load tags:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      loadTags();
    }
  }, [isOpen]);

  // 検索クエリの同期
  useEffect(() => {
    setSearchQuery(currentQuery);
  }, [currentQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    } else {
      params.delete('q');
    }
    
    const search = params.toString();
    navigate({ pathname: '/', search: search ? `?${search}` : '' });
    onClose();
  };

  const handleTagClick = (tagName: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tag', tagName);
    const search = params.toString();
    navigate({ pathname: '/', search: search ? `?${search}` : '' });
    onClose();
  };

  const handleClearTag = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('tag');
    const search = params.toString();
    navigate({ pathname: '/', search: search ? `?${search}` : '' });
  };

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* ドロワー本体 */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-80 bg-background border-l transform transition-transform duration-200 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between h-14 px-4 border-b">
          <span className="font-semibold text-lg">検索・タグ</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* コンテンツ */}
        <div className="flex flex-col h-[calc(100%-56px)]">
          {/* 検索バー */}
          <div className="p-4 border-b">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="ノートを検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4"
                  autoFocus={isOpen}
                />
              </div>
            </form>
          </div>

          {/* タグ一覧 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                タグ
              </span>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">読み込み中...</div>
            ) : tags.length === 0 ? (
              <div className="text-sm text-muted-foreground">タグはありません</div>
            ) : (
              <div className="space-y-1">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleTagClick(tag.name)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors text-left ${
                      selectedTag === tag.name
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span className={`text-sm ${tag.name === '__untagged__' ? 'italic text-muted-foreground' : ''}`}>
                      {tag.name === '__untagged__' ? 'タグなし' : `#${tag.name}`}
                    </span>
                    <span className={`text-xs ${
                      selectedTag === tag.name
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground'
                    }`}>
                      {tag.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 選択中のタグをクリア */}
          {selectedTag && (
            <div className="p-4 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleClearTag}
              >
                フィルタをクリア
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
