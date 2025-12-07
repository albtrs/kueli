'use client';

import { useState } from 'react';
import { AppHeader } from './AppHeader';
import { LeftDrawer } from './LeftDrawer';
import { RightDrawer } from './RightDrawer';
import { DesktopSidebar } from './DesktopSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** サイドバーを表示するモード（ダッシュボード用） */
  showSidebar?: boolean;
}

export function DashboardLayout({ children, showSidebar = false }: DashboardLayoutProps) {
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー（全画面共通） */}
      <AppHeader
        onOpenLeftDrawer={() => setIsLeftDrawerOpen(true)}
        onOpenRightDrawer={() => setIsRightDrawerOpen(true)}
      />

      {/* メインエリア - 画面全体の中央に配置 */}
      <div className="flex-1 flex justify-center">
        <div className={`w-full ${showSidebar ? 'max-w-7xl' : 'max-w-6xl'} flex`}>
          {/* PC用サイドバー（showSidebarモードでのみ表示） */}
          {showSidebar && <DesktopSidebar />}

          {/* コンテンツエリア */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>

      {/* モバイル用ドロワー */}
      <LeftDrawer
        isOpen={isLeftDrawerOpen}
        onClose={() => setIsLeftDrawerOpen(false)}
      />
      <RightDrawer
        isOpen={isRightDrawerOpen}
        onClose={() => setIsRightDrawerOpen(false)}
      />
    </div>
  );
}
