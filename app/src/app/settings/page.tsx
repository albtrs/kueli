import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { DashboardLayout } from '@/components/layout';
import { BackupControls } from '@/components/settings/BackupControls';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <DashboardLayout>
      <div className="px-4 py-6 md:px-6">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold">設定</h1>
            <p className="text-muted-foreground mt-1">
              アプリケーションの設定を管理します
            </p>
          </div>

          {/* バックアップセクション */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">バックアップ</h2>
              <p className="text-sm text-muted-foreground mt-1">
                ノートデータのエクスポート・インポートができます
              </p>
            </div>
            <div className="p-4 border rounded-lg bg-card">
              <BackupControls />
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
