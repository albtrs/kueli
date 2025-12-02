'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { LogOut, Paperclip, X, Archive, Home, Settings } from 'lucide-react';

interface LeftDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LeftDrawer({ isOpen, onClose }: LeftDrawerProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/login');
    onClose();
  };

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
  };

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* ドロワー本体 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-background border-r transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between h-14 px-4 border-b">
          <span className="font-semibold text-lg">メニュー</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* メニューコンテンツ */}
        <div className="flex flex-col h-[calc(100%-56px)]">
          {/* メインメニュー */}
          <nav className="flex-1 p-4 space-y-1">
            <button
              onClick={() => handleNavigate('/')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <Home className="h-5 w-5 text-muted-foreground" />
              <span>ホーム</span>
            </button>
            <button
              onClick={() => handleNavigate('/archived')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <Archive className="h-5 w-5 text-muted-foreground" />
              <span>アーカイブ</span>
            </button>
            <button
              onClick={() => handleNavigate('/attachments')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <Paperclip className="h-5 w-5 text-muted-foreground" />
              <span>添付ファイル</span>
            </button>
            <button
              onClick={() => handleNavigate('/settings')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <Settings className="h-5 w-5 text-muted-foreground" />
              <span>設定</span>
            </button>
          </nav>

          {/* 下部：ログアウト */}
          <div className="p-4 border-t">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-left"
            >
              <LogOut className="h-5 w-5" />
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
