import { useParams } from 'react-router-dom'
import { NoteEditor } from '@/components/NoteEditor'

export function NotePage() {
  const { id } = useParams()
  if (!id) {
    return null
  }
  return <NoteEditor noteId={id} />
}
