import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { getNotes } from '@/lib/queries';
import { Sidebar } from '@/components/Sidebar';
import { DashboardHeader } from '@/components/DashboardHeader';
import { NoteGrid } from '@/components/NoteGrid';
import { Loader2, FileText, Pin, Clock } from 'lucide-react';

interface PageProps {
  searchParams: Promise<{ tag?: string; q?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  // Server Componentで認証チェック
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  // searchParamsをawaitで解決 (Next.js 15以降はPromise)
  const params = await searchParams;
  const selectedTag = params.tag;
  const searchQuery = params.q;

  // Server Componentでデータ取得
  const allNotes = await getNotes();
  
  // フィルタリング
  let filtered = allNotes;
  
  // タグでフィルタリング
  if (selectedTag) {
    filtered = filtered.filter((note) => note.tags.includes(selectedTag));
  }
  
  // 全文検索
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((note) => 
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    );
  }

  // ピン留めと通常のメモに分ける
  const pinnedNotes = filtered.filter((note) => note.isPinned);
  const recentNotes = filtered;

  return (
    <div className="flex min-h-screen">
      {/* サイドバー */}
      <Sidebar />

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ヘッダー (Client Component) */}
        <Suspense fallback={<div className="h-14 border-b" />}>
          <DashboardHeader />
        </Suspense>

        {/* スクロール可能なメインエリア */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pl-14 md:pl-6">
          <div className="max-w-6xl mx-auto">
            {/* ピン留めセクション */}
            {pinnedNotes.length > 0 && (
              <section className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Pin className="h-4 w-4" /> ピン留め
                </h2>
                <NoteGrid notes={pinnedNotes} />
              </section>
            )}

            {/* 最近のメモセクション */}
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" /> 最近更新
              </h2>
              {recentNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">メモがありません</p>
                </div>
              ) : (
                <NoteGrid notes={recentNotes} />
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}