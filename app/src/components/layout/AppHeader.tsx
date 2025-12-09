'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Menu, Plus, Search } from 'lucide-react';

interface AppHeaderProps {
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
}

export function AppHeader({ onOpenLeftDrawer, onOpenRightDrawer }: AppHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.get('q') || '';
  
  const [searchQuery, setSearchQuery] = useState(currentQuery);

  // URLパラメータの変更を検索クエリに同期
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
    
    router.push(`/?${params.toString()}`);
    router.refresh();
  };

  const handleCreateNote = () => {
    router.push('/notes/new');
  };

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* 5カラムグリッド: 余白|左ペイン(16rem)|メイン(62rem)|右ペイン(16rem)|余白 */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_16rem_62rem_16rem_1fr] h-14">
        {/* 左余白 */}
        <div className="hidden xl:block" />
        
        {/* 左ペイン - ハンバーガー + ロゴ */}
        <div className="hidden xl:flex items-center px-4">
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
          </div>
        </div>
        
        {/* メインエリア */}
        <div className="flex items-center justify-between px-4 xl:justify-center">
          {/* モバイル用：ハンバーガー + ロゴ */}
          <div className="flex items-center gap-2 xl:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={onOpenLeftDrawer}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 font-semibold text-lg hover:opacity-80 transition-opacity"
            >
              <span>Kueli</span>
            </button>
          </div>
          
          {/* 新規ボタン + 検索バー */}
          <div className="flex items-center gap-2">
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
        </div>
        
        {/* 右ペイン */}
        <div className="hidden xl:block" />
        
        {/* 右余白 */}
        <div className="hidden xl:block" />
      </div>
    </header>
  );
}
