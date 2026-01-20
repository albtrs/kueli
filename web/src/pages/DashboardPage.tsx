import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout'
import { NoteDashboard } from '@/components/NoteDashboard'
import { fetchNotes, fetchNotesPage } from '@/api/notes'
import type { Note } from '@/lib/types'
import { useSession } from '@/hooks/useSession'

export function DashboardPage() {
  const { status } = useSession()
  const [searchParams] = useSearchParams()
  const selectedTag = searchParams.get('tag') || undefined
  const searchQuery = searchParams.get('q') || undefined
  const sortOrder = (searchParams.get('sort') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'

  const isSearchMode = useMemo(() => Boolean(selectedTag || searchQuery), [selectedTag, searchQuery])

  const [isLoading, setIsLoading] = useState(true)
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([])
  const [initialNotes, setInitialNotes] = useState<Note[]>([])
  const [initialCursor, setInitialCursor] = useState<string | null>(null)
  const [initialHasMore, setInitialHasMore] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') {
      return
    }

    let active = true
    const load = async () => {
      setIsLoading(true)
      try {
        let pinned: Note[] = []
        if (!isSearchMode) {
          const allNotes = await fetchNotes(false)
          pinned = allNotes.filter((note) => note.isPinned)
        }

        const page = await fetchNotesPage(
          null,
          20,
          selectedTag,
          searchQuery,
          false,
          !isSearchMode,
          sortOrder
        )

        if (!active) return
        setPinnedNotes(pinned)
        setInitialNotes(page.notes)
        setInitialCursor(page.nextCursor)
        setInitialHasMore(page.hasMore)
      } catch (error) {
        console.error('Failed to load dashboard notes:', error)
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [status, selectedTag, searchQuery, sortOrder, isSearchMode])

  if (status !== 'authenticated' || isLoading) {
    return (
      <DashboardLayout showSidebar>
        <div className="flex h-full items-center justify-center text-muted-foreground">
          読み込み中...
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout showSidebar>
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <NoteDashboard
            initialPinnedNotes={pinnedNotes}
            initialNotes={initialNotes}
            initialCursor={initialCursor}
            initialHasMore={initialHasMore}
            tag={selectedTag}
            search={searchQuery}
            sortOrder={sortOrder}
            isSearchMode={isSearchMode}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
