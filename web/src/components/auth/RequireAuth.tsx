import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '@/hooks/useSession'

export function RequireAuth() {
  const { status } = useSession()

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        認証を確認中...
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
