'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { NoteEditor } from '@/components/NoteEditor';
import { Loader2 } from 'lucide-react';

function NewNotePageContent() {
  const searchParams = useSearchParams();
  const initialTitle = searchParams.get('title') || undefined;
  
  return <NoteEditor noteId={null} initialTitle={initialTitle} />;
}

export default function NewNotePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <NewNotePageContent />
    </Suspense>
  );
}
