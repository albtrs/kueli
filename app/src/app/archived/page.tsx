import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getNotesPage } from '@/lib/queries';
import { DashboardLayout } from '@/components/layout';
import { ArchivedNoteGrid } from '@/components/ArchivedNoteGrid';
import { Archive } from 'lucide-react';

// 動的レンダリングを強制
export const dynamic = 'force-dynamic';

export default async function ArchivedPage() {
  // Server Componentで認証チェック
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  // アーカイブ済みノートを取得（includeArchived=true でアーカイブのみ）
  const initialPage = await getNotesPage(null, 20, undefined, undefined, true);
  
  // アーカイブされたノートのみをフィルタ
  const archivedNotes = initialPage.notes.filter(note => note.isArchived);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Archive className="h-5 w-5" />
            アーカイブ
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            一時保留中のメモです。「戻す」で通常のメモに復元できます。
          </p>
          <ArchivedNoteGrid 
            initialNotes={archivedNotes}
            initialCursor={initialPage.nextCursor}
            initialHasMore={initialPage.hasMore}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
