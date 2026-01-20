import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout'
import { ArchivedNoteGrid } from '@/components/ArchivedNoteGrid'
import { fetchNotesPage } from '@/api/notes'
import type { Note } from '@/lib/types'
import { useSession } from '@/hooks/useSession'
import { Archive } from 'lucide-react'

export function ArchivedPage() {
  const { status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [notes, setNotes] = useState<Note[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    let active = true

    const load = async () => {
      setIsLoading(true)
      try {
        const page = await fetchNotesPage(null, 20, undefined, undefined, true)
        if (!active) return
        const archivedNotes = page.notes.filter((note) => note.isArchived)
        setNotes(archivedNotes)
        setCursor(page.nextCursor)
        setHasMore(page.hasMore)
      } catch (error) {
        console.error('Failed to load archived notes:', error)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [status])

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Archive className="h-5 w-5" />
            アーカイブ
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            一時保留中のメモです。「戻す」で通常のメモに復元できます。
          </p>
          {isLoading ? (
            <div className="text-muted-foreground text-sm">読み込み中...</div>
          ) : (
            <ArchivedNoteGrid initialNotes={notes} initialCursor={cursor} initialHasMore={hasMore} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
