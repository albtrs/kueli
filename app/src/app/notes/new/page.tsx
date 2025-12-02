'use client';

import { useSearchParams } from 'next/navigation';
import { NoteEditor } from '@/components/NoteEditor';

export default function NewNotePage() {
  const searchParams = useSearchParams();
  const initialTitle = searchParams.get('title') || undefined;
  
  return <NoteEditor noteId={null} initialTitle={initialTitle} />;
}
