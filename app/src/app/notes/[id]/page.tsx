'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { getNote, saveNote as saveNoteAction, deleteNote } from '@/actions/note';
import { Note } from '@/lib/types';
import { extractTags } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Check, Upload } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// CodeMirrorは動的インポート（SSR無効化）
const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror').then((mod) => mod.default),
  { ssr: false }
);

// Markdownエクステンションも動的インポート
const getMarkdownExtension = async () => {
  const { markdown } = await import('@codemirror/lang-markdown');
  const { languages } = await import('@codemirror/language-data');
  return markdown({ codeLanguages: languages });
};

type SaveStatus = 'saved' | 'saving' | 'unsaved';

export default function EditorPage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;
  const { data: session, status } = useSession();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [extensions, setExtensions] = useState<any[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Markdownエクステンションを読み込み
  useEffect(() => {
    getMarkdownExtension().then((ext) => {
      setExtensions([ext]);
    });
  }, []);

  // ノートを取得
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status !== 'authenticated') {
      return;
    }

    let isMounted = true;

    const fetchNote = async () => {
      try {
        const record = await getNote(noteId);
        
        if (!record) {
          if (isMounted) {
            router.push('/');
          }
          return;
        }
        
        if (isMounted) {
          setNote(record);
          setTitle(record.title);
          setContent(record.content || '');
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch note:', err);
          router.push('/');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchNote();

    return () => {
      isMounted = false;
    };
  }, [noteId, router, status]);
  
  // オートセーブ（デバウンス）
  const performSave = useCallback(
    async (newTitle: string, newContent: string) => {
      if (!note) return;

      setSaveStatus('saving');
      try {
        // タグを自動抽出
        const tags = extractTags(newContent);
        
        const updated = await saveNoteAction(note.id, {
          title: newTitle,
          content: newContent,
          tags,
        });
        setNote(updated);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to save note:', err);
        setSaveStatus('unsaved');
      }
    },
    [note]
  );

  // タイトル変更ハンドラ
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setSaveStatus('unsaved');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      performSave(newTitle, content);
    }, 1000);
  };

  // コンテンツ変更ハンドラ
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setSaveStatus('unsaved');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      performSave(title, newContent);
    }, 1000);
  };

  // ファイルアップロード
  const uploadFile = async (file: File): Promise<string | null> => {
    if (!note) return null;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      
      // Save the image filename to note
      const updatedImages = [...(note.images || []), data.filename];
      const updated = await saveNoteAction(note.id, {
        ...note,
        images: updatedImages,
      });
      setNote(updated);

      return data.url;
    } catch (err) {
      console.error('Failed to upload file:', err);
      return null;
    }
  };

  // ドラッグ&ドロップハンドラ
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      const url = await uploadFile(file);
      if (url) {
        // 画像かどうかで挿入形式を変える
        const isImage = file.type.startsWith('image/');
        const insertText = isImage
          ? `![${file.name}](${url})\n`
          : `[${file.name}](${url})\n`;
        
        const newContent = content + insertText;
        setContent(newContent);
        handleContentChange(newContent);
      }
    }
  };

  const handleDelete = async () => {
    if (!note || !confirm('このメモを削除しますか？')) return;

    try {
      await deleteNote(note.id);
      router.push('/');
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert('削除に失敗しました');
    }
  };

  const handleManualSave = async () => {
    if (!note) return;
    await performSave(title, content);
  };

  // カスタムMarkdownレンダラー（認証付きAPI経由）
  const markdownComponents: any = {
    img: ({ src, alt, ...props }: any) => {
      if (!src || typeof src !== 'string') return null;
      
      // /uploads/* を /api/images/* に変換
      const imageSrc = src.startsWith('/uploads/')
        ? src.replace('/uploads/', '/api/images/')
        : src;
      
      return (
        <img
          {...props}
          src={imageSrc}
          alt={alt || ''}
          className="max-w-full h-auto rounded-lg my-2"
          loading="lazy"
        />
      );
    },
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* サイドバーは別途インポート可能だが、ここでは省略してメインエリアのみ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center gap-2 px-6">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">保存中...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="hidden sm:inline">保存済み</span>
                </>
              )}
              {saveStatus === 'unsaved' && <span className="hidden sm:inline">未保存</span>}
              <Button variant="outline" size="sm" onClick={handleManualSave}>
                保存
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                削除
              </Button>
            </div>
          </div>
        </header>

        {/* Editor */}
        <main className="flex-1 container mx-auto p-4">
        <Tabs defaultValue="write" className="h-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="write">編集</TabsTrigger>
              <TabsTrigger value="preview">プレビュー</TabsTrigger>
            </TabsList>
          </div>
          
          {/* タイトル入力欄をエディタの上に配置 */}
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="タイトル"
            className="mb-4 text-2xl font-bold border-none focus-visible:ring-0 px-0"
          />

          <TabsContent value="write" className="h-[calc(100vh-180px)]">
            <div
              className={`h-full rounded-lg border ${
                isDragOver ? 'border-primary border-2 bg-primary/5' : 'border-input'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded-lg">
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <Upload className="h-8 w-8" />
                    <span>ファイルをドロップ</span>
                  </div>
                </div>
              )}
              <CodeMirror
                value={content}
                height="100%"
                extensions={extensions}
                onChange={handleContentChange}
                placeholder="Markdownで入力..."
                className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:h-full"
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="preview" className="h-[calc(100vh-180px)] overflow-auto">
            <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border border-input p-4">
              {content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {content}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">プレビューする内容がありません</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      </div>
    </div>
  );
}