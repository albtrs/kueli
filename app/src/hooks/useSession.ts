'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
}

interface SessionState {
  user: User | null;
  isLoggedIn: boolean;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}

export function useSession() {
  const [session, setSession] = useState<SessionState>({
    user: null,
    isLoggedIn: false,
    status: 'loading',
  });

  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSession({
          user: data.user,
          isLoggedIn: true,
          status: 'authenticated',
        });
        return;
      }

      if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (refreshResponse.ok) {
          const meResponse = await fetch('/api/auth/me', {
            credentials: 'include',
          });
          if (meResponse.ok) {
            const data = await meResponse.json();
            setSession({
              user: data.user,
              isLoggedIn: true,
              status: 'authenticated',
            });
            return;
          }
        }
      }

      setSession({
        user: null,
        isLoggedIn: false,
        status: 'unauthenticated',
      });
    } catch {
      setSession({
        user: null,
        isLoggedIn: false,
        status: 'unauthenticated',
      });
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { ...session, refetch: fetchSession };
}

export function useRequireAuth(redirectTo = '/login') {
  const router = useRouter();
  const { status, user, isLoggedIn, refetch } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(redirectTo);
    }
  }, [status, router, redirectTo]);

  return { status, user, isLoggedIn, refetch };
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
  }
}
