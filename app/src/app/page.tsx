import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getNotesPage, getNotes } from '@/lib/queries';
import { DashboardLayout } from '@/components/layout';
import { NoteDashboard } from '@/components/NoteDashboard';

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

  // ピン留めノートは全件取得（数が少ないため）
  const allNotes = await getNotes();
  const pinnedNotes = allNotes.filter((note) => note.isPinned);
  
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