import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/hooks/useSession'

function normalizeRedirectTarget(target: string | null) {
  if (!target) return '/'
  if (!target.startsWith('/')) return '/'
  if (target.startsWith('//')) return '/'
  return target
}

function useRedirectTarget() {
  const location = useLocation()
  return useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeRedirectTarget(params.get('from'))
  }, [location.search])
}

export function LoginPage() {
  const navigate = useNavigate()
  const redirectTo = useRedirectTarget()
  const { refresh, status } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(redirectTo, { replace: true })
    }
  }, [status, navigate, redirectTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        skipAuthRefresh: true,
      })

      if (!response.ok) {
        setError('ユーザー名またはパスワードが正しくありません')
        return
      }

      await refresh()
      navigate(redirectTo, { replace: true })
    } catch (err) {
      console.error('Login error:', err)
      setError('ログインに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl">Kueli</CardTitle>
          <CardDescription className="text-xs">
            ログインしてください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs">
                ユーザー名
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">
                パスワード
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="h-9"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-9" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ログイン中...
                </>
              ) : (
                'ログイン'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
