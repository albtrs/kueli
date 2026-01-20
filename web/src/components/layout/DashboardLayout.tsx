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
  /** 右サイドバー（目次/バックリンク等） */
  rightSidebar?: React.ReactNode;
}

export function DashboardLayout({ children, showSidebar = false, rightSidebar }: DashboardLayoutProps) {
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー（全画面共通） */}
      <AppHeader
        onOpenLeftDrawer={() => setIsLeftDrawerOpen(true)}
        onOpenRightDrawer={() => setIsRightDrawerOpen(true)}
      />

      {/* メインエリア - 5カラムグリッド: 余白|左ペイン(16rem)|メイン(62rem)|右ペイン(16rem)|余白 */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_16rem_62rem_16rem_1fr]">
        {/* 左余白 */}
        <div className="hidden xl:block" />
        
        {/* 左ペイン（タグ一覧） */}
        <div className="hidden xl:block px-4 pt-4">
          {showSidebar && (
            <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">
              <DesktopSidebar />
            </div>
          )}
        </div>

        {/* メインコンテンツ */}
        <main className="min-w-0 px-4">
          {children}
        </main>

        {/* 右ペイン（目次/バックリンク等） */}
        <div className="hidden xl:block px-4 pt-4">
          {rightSidebar && (
            <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">
              {rightSidebar}
            </div>
          )}
        </div>
        
        {/* 右余白 */}
        <div className="hidden xl:block" />
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
