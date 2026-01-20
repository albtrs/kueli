import { useSearchParams } from 'react-router-dom'
import { NoteEditor } from '@/components/NoteEditor'

export function NewNotePage() {
  const [searchParams] = useSearchParams()
  const initialTitle = searchParams.get('title') || undefined
  return <NoteEditor noteId={null} initialTitle={initialTitle} />
}
