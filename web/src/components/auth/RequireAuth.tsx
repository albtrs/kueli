import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/hooks/useSession'

export function RequireAuth() {
  const { status } = useSession()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        認証を確認中...
      </div>
    )
  }

  if (status === 'unauthenticated') {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
  }

  return <Outlet />
}
