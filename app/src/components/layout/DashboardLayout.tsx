'use client';

import { useState } from 'react';
import { AppHeader } from './AppHeader';
import { LeftDrawer } from './LeftDrawer';
import { RightDrawer } from './RightDrawer';
import { DesktopSidebar } from './DesktopSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** サイドバーを非表示にするモード（エディタ等） */
  hideSidebar?: boolean;
}

export function DashboardLayout({ children, hideSidebar = false }: DashboardLayoutProps) {
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー（全画面共通） */}
      <AppHeader
        onOpenLeftDrawer={() => setIsLeftDrawerOpen(true)}
        onOpenRightDrawer={() => setIsRightDrawerOpen(true)}
      />

      {/* メインエリア */}
      <div className="flex flex-1">
        {/* PC用サイドバー（hideSidebarモードでは非表示） */}
        {!hideSidebar && <DesktopSidebar />}

        {/* コンテンツエリア */}
        <main className={`flex-1 ${hideSidebar ? 'overflow-hidden' : ''}`}>
          {children}
        </main>
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
