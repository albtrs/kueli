'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { saveNote } from '@/actions/note';
import { Loader2 } from 'lucide-react';

export default function NewNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status !== 'authenticated') {
      return;
    }

    const createNewNote = async () => {
      if (isCreating) return;
      setIsCreating(true);
      
      try {
        // URLパラメータからタイトルを取得、なければ日時ベースのタイトル
        const titleParam = searchParams.get('title');
        const title = titleParam || generateDateTimeTitle();
        
        const note = await saveNote(null, {
          title,
          content: '',
          tags: [],
          images: [],
        });
        
        router.replace(`/notes/${note.id}`);
      } catch (err) {
        console.error('Failed to create note:', err);
        setError('ノートの作成に失敗しました');
      }
    };

    createNewNote();
  }, [status, searchParams, router, isCreating]);

  // 日時ベースのタイトルを生成
  function generateDateTimeTitle(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="text-primary hover:underline"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">ノートを作成中...</span>
      </div>
    </div>
  );
}
