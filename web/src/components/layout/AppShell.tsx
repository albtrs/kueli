import { Link } from 'react-router-dom'
import { useSession } from '@/hooks/useSession'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-semibold text-lg">
            kueli
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/" className="hover:underline">
              メモ
            </Link>
            <Link to="/archived" className="hover:underline">
              アーカイブ
            </Link>
            <Link to="/attachments" className="hover:underline">
              添付
            </Link>
            <Link to="/settings" className="hover:underline">
              設定
            </Link>
            <span className="text-muted-foreground">{user?.username}</span>
            <button
              type="button"
              onClick={() => logout()}
              className="text-destructive hover:underline"
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      </main>
    </div>
  )
}
