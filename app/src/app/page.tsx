import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getNotesPage, getNotes } from '@/lib/queries';
import { DashboardLayout } from '@/components/layout';
import { NoteDashboard } from '@/components/NoteDashboard';

// 検索パラメータを使用するため動的レンダリングを強制
export const dynamic = 'force-dynamic';

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

  // ピン留めノートは全件取得後、フィルタを適用
  const allNotes = await getNotes();
  let pinnedNotes = allNotes.filter((note) => note.isPinned);
  
  // タグフィルタを適用
  if (selectedTag) {
    if (selectedTag === '__untagged__') {
      pinnedNotes = pinnedNotes.filter(note => !note.tags || note.tags.length === 0);
    } else {
      pinnedNotes = pinnedNotes.filter(note => note.tags?.includes(selectedTag));
    }
  }
  
  // 検索フィルタを適用
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    pinnedNotes = pinnedNotes.filter(note => 
      note.title?.toLowerCase().includes(query) || 
      note.content?.toLowerCase().includes(query)
    );
  }
  
  // 最近のノートはページネーションで取得（初期20件）
  const initialPage = await getNotesPage(null, 20, selectedTag, searchQuery);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <NoteDashboard
            initialPinnedNotes={pinnedNotes}
            initialNotes={initialPage.notes}
            initialCursor={initialPage.nextCursor}
            initialHasMore={initialPage.hasMore}
            tag={selectedTag}
            search={searchQuery}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}