'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { fetchNotes } from '@/actions/note';
import { Tag } from 'lucide-react';

interface TagRecord {
  id: string;
  name: string;
  count: number;
}

export function DesktopSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTag = searchParams.get('tag');
  const { status } = useSession();
  
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      loadTags();
    } else if (status === 'unauthenticated') {
      setIsLoading(false);
    }
  }, [status]);

  const loadTags = async () => {
    try {
      const allNotes = await fetchNotes();
      const tagCounts = new Map<string, number>();
      let untaggedCount = 0;
      
      allNotes.forEach(note => {
        if (note.tags && Array.isArray(note.tags) && note.tags.length > 0) {
          note.tags.forEach(tag => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        } else {
          untaggedCount++;
        }
      });
      
      const tagsArray: TagRecord[] = Array.from(tagCounts.entries())
        .map(([name, count], index) => ({
          id: `tag_${index}`,
          name,
          count
        }))
        .sort((a, b) => b.count - a.count);
      
      // 「タグなし」を最上部に追加
      if (untaggedCount > 0) {
        tagsArray.unshift({
          id: 'tag_untagged',
          name: '__untagged__',
          count: untaggedCount
        });
      }
      
      setTags(tagsArray);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTagClick = (tagName: string) => {
    router.push(`/?tag=${encodeURIComponent(tagName)}`);
    router.refresh();
  };

  return (
    <aside className="h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          タグ
        </span>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground px-2">読み込み中...</div>
      ) : tags.length === 0 ? (
        <div className="text-xs text-muted-foreground px-2">タグはありません</div>
      ) : (
        <div className="space-y-0.5">
          {tags.map(tag => (
            <button
              key={tag.id}
              onClick={() => handleTagClick(tag.name)}
              className={`flex items-center justify-between w-full px-2 py-1.5 rounded transition-colors text-left ${
                selectedTag === tag.name
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <span className={`text-sm truncate ${tag.name === '__untagged__' ? 'italic text-muted-foreground' : ''}`}>
                {tag.name === '__untagged__' ? 'タグなし' : `#${tag.name}`}
              </span>
              <span className={`text-xs ${
                selectedTag === tag.name
                  ? 'text-primary-foreground/70'
                  : 'text-muted-foreground'
              }`}>
                {tag.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
