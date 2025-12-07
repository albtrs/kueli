import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getNotesPage, getNotes } from '@/lib/queries';
import { DashboardLayout } from '@/components/layout';
import { NoteDashboard } from '@/components/NoteDashboard';

// 検索パラメータを使用するため動的レンダリングを強制
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ tag?: string; q?: string; sort?: string }>;
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
  const sortOrder = (params.sort === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  
  // 検索モードかどうか（タグ選択またはキーワード検索がある場合）
  const isSearchMode = !!(selectedTag || searchQuery);

  // 検索モードでない場合のみピン留めセクションを表示
  let pinnedNotes: Awaited<ReturnType<typeof getNotes>> = [];
  if (!isSearchMode) {
    const allNotes = await getNotes(false);
    pinnedNotes = allNotes.filter((note) => note.isPinned);
  }
  
  // ノート取得（検索モードではピン留め含む全件、通常モードではピン留め除外）
  const initialPage = await getNotesPage(
    null, 
    20, 
    selectedTag, 
    searchQuery, 
    false, 
    !isSearchMode, // 検索モードではピン留めも含める
    sortOrder
  );

  return (
    <DashboardLayout showSidebar>
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <NoteDashboard
            initialPinnedNotes={pinnedNotes}
            initialNotes={initialPage.notes}
            initialCursor={initialPage.nextCursor}
            initialHasMore={initialPage.hasMore}
            tag={selectedTag}
            search={searchQuery}
            sortOrder={sortOrder}
            isSearchMode={isSearchMode}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}