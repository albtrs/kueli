'use client';

import { useParams } from 'next/navigation';
import { NoteEditor } from '@/components/NoteEditor';

export default function EditNotePage() {
  const params = useParams();
  const noteId = params.id as string;
  
  return <NoteEditor noteId={noteId} />;
}
