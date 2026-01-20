import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api'

export interface User {
  id: number
  username: string
  isAdmin: boolean
}

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface SessionContextValue {
  user: User | null
  status: SessionStatus
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const response = await apiFetch('/api/auth/me')
      if (response.ok) {
        const data = await response.json()
        setUser(data.user ?? null)
        setStatus('authenticated')
        return
      }
      setUser(null)
      setStatus('unauthenticated')
    } catch {
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', skipAuthRefresh: true })
    } finally {
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      status,
      refresh,
      logout,
    }),
    [user, status, refresh, logout]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSessionContext() {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSessionContext must be used within SessionProvider')
  }
  return ctx
}
