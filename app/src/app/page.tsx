import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { getNotes } from '@/actions/note';
import { Sidebar } from '@/components/Sidebar';
import { DashboardHeader } from '@/components/DashboardHeader';
import { NoteGrid } from '@/components/NoteGrid';
import { Loader2, FileText } from 'lucide-react';

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
    <div className="flex h-screen overflow-hidden">
      {/* サイドバー */}
      <Sidebar />

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ヘッダー (Client Component) */}
        <Suspense fallback={<div className="h-14 border-b" />}>
          <DashboardHeader />
        </Suspense>

        {/* スクロール可能なメインエリア */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* ピン留めセクション */}
          {pinnedNotes.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">📌 ピン留め</h2>
              <NoteGrid notes={pinnedNotes} />
            </section>
          )}

          {/* 最近のメモセクション */}
          <section>
            <h2 className="text-xl font-semibold mb-4">🕒 最近更新されたメモ</h2>
            {recentNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">メモがありません</p>
              </div>
            ) : (
              <NoteGrid notes={recentNotes} />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}