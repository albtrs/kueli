'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Menu, Plus, Search, X } from 'lucide-react';

interface AppHeaderProps {
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
}

export function AppHeader({ onOpenLeftDrawer, onOpenRightDrawer }: AppHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTag = searchParams.get('tag');
  const currentQuery = searchParams.get('q') || '';
  
  const [searchQuery, setSearchQuery] = useState(currentQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    } else {
      params.delete('q');
    }
    
    router.push(`/?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    router.push('/');
  };

  const handleCreateNote = () => {
    router.push('/notes/new');
  };

  const hasFilters = selectedTag || currentQuery;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-2 px-4">
        {/* 左側：ハンバーガー + ロゴ */}
        <div className="flex items-center gap-2">
          {/* 左ドロワートグル（PC/モバイル共通） */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onOpenLeftDrawer}
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          {/* ロゴ/アプリ名 */}
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 font-semibold text-lg hover:opacity-80 transition-opacity"
          >
            <span>Kueli</span>
          </button>
          
          {/* フィルタ表示 */}
          {hasFilters && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-sm text-muted-foreground">
                {selectedTag ? `#${selectedTag}` : currentQuery}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleClearFilters}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        
        {/* 中央：スペーサー（PCのみ） */}
        <div className="hidden md:block flex-1" />
        
        {/* 新規ボタン + 検索バー */}
        <div className="flex items-center gap-2 ml-auto md:ml-0">
          {/* 新規作成ボタン */}
          <Button 
            variant="default" 
            size="icon"
            onClick={handleCreateNote}
            className="h-9 w-9"
          >
            <Plus className="h-5 w-5" />
          </Button>
          
          {/* PC：検索バー */}
          <form onSubmit={handleSearch} className="hidden md:block w-64 lg:w-80">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="ノートを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 pr-4"
              />
            </div>
          </form>
          
          {/* モバイル：検索/タグドロワートグル */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={onOpenRightDrawer}
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>
        
        {/* 右側：スペーサー（PCのみ） */}
        <div className="hidden md:block flex-1" />
      </div>
    </header>
  );
}
