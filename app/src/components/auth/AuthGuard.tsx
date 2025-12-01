'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getPocketBase } from '@/lib/pocketbase';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      const pb = getPocketBase();
      const isValid = pb.authStore.isValid;
      
      setIsAuthenticated(isValid);
      setIsLoading(false);

      if (!isValid && pathname !== '/login') {
        router.push('/login');
      }
    };

    checkAuth();

    // 認証状態の変化を監視
    const pb = getPocketBase();
    const unsubscribe = pb.authStore.onChange(() => {
      checkAuth();
    });

    return () => {
      unsubscribe();
    };
  }, [router, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ログインページは認証不要
  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
