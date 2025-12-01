'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogOut, X, Search, Plus } from 'lucide-react';

export function DashboardHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTag = searchParams.get('tag');
  const currentQuery = searchParams.get('q') || '';
  
  const [searchQuery, setSearchQuery] = useState(currentQuery);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/login');
  };

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
    <header className="border-b bg-background">
      <div className="max-w-6xl mx-auto flex h-12 items-center gap-2 px-4 md:px-6">
        {/* タイトル（モバイルではスペース確保のため左マージン） */}
        <div className="flex items-center gap-1.5 ml-10 md:ml-0">
          <h1 className="text-sm font-medium truncate max-w-[120px] md:max-w-none md:text-base">
            {selectedTag ? `#${selectedTag}` : 'Kueli'}
          </h1>
          {hasFilters && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClearFilters}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        
        {/* 中央スペーサー */}
        <div className="flex-1" />
        
        {/* 検索バー（中央寄せ） */}
        <form onSubmit={handleSearch} className="w-full max-w-xs md:max-w-sm">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>
        </form>
        
        {/* 新規メモボタン */}
        <Button 
          variant="default" 
          size="icon" 
          onClick={handleCreateNote}
          className="h-9 w-9"
          title="新規メモ"
        >
          <Plus className="h-4 w-4" />
        </Button>
        
        {/* 中央スペーサー */}
        <div className="flex-1" />

        <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
