'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { getNote, saveNote as saveNoteAction, deleteNote } from '@/actions/note';
import { Note } from '@/lib/types';
import { extractTags } from '@/lib/utils';
import { createTableTemplate, convertTsvToMd, formatMarkdownTable, findTableRange } from '@/lib/table-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Check, Upload, Table, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';

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
  const [isUploading, setIsUploading] = useState(false);
  const [defaultTab, setDefaultTab] = useState<'write' | 'preview'>('write');
  const [editorReady, setEditorReady] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

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
          // コンテンツがある場合はプレビュー、ない場合は編集をデフォルトに
          setDefaultTab(record.content ? 'preview' : 'write');
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
  const uploadFile = async (file: File): Promise<{ url: string | null; error?: string }> => {
    if (!note) return { url: null, error: 'ノートが見つかりません' };

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { 
          url: null, 
          error: errorData.error || 'アップロードに失敗しました' 
        };
      }

      const data = await response.json();
      
      // Save the image filename to note
      const updatedImages = [...(note.images || []), data.filename];
      const updated = await saveNoteAction(note.id, {
        ...note,
        images: updatedImages,
      });
      setNote(updated);

      return { url: data.url };
    } catch (err) {
      console.error('Failed to upload file:', err);
      return { 
        url: null, 
        error: err instanceof Error ? err.message : 'アップロードに失敗しました' 
      };
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
    
    try {
      setIsUploading(true);
      
      // 全ファイルのアップロードを待つ
      const uploadPromises = files.map(file => uploadFile(file));
      const results = await Promise.all(uploadPromises);
      
      // エラーメッセージを収集
      const errors: string[] = [];
      let insertText = '';
      
      files.forEach((file, index) => {
        const result = results[index];
        if (result.url) {
          insertText += `![${file.name}](${result.url})\n`;
        } else if (result.error) {
          errors.push(`${file.name}: ${result.error}`);
        }
      });
      
      // エラーがあれば表示
      if (errors.length > 0) {
        alert('以下のファイルのアップロードに失敗しました:\n\n' + errors.join('\n'));
      }
      
      // 成功したファイルのMarkdownを挿入
      if (insertText) {
        const newContent = content + insertText;
        setContent(newContent);
        handleContentChange(newContent);
      }
    } finally {
      setIsUploading(false);
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

  // テーブル機能
  const handleInsertTable = () => {
    const tableMd = createTableTemplate(3, 3);
    const view = editorRef.current?.view;
    if (view) {
      const range = view.state.selection.main;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: '\n' + tableMd + '\n' }
      });
      view.focus();
    }
  };

  const handleFormatTable = () => {
    const view = editorRef.current?.view;
    if (!view) return;

    const range = view.state.selection.main;
    
    // 選択範囲がある場合はそれを整形
    if (range.from !== range.to) {
      const selectedText = view.state.sliceDoc(range.from, range.to);
      if (selectedText.includes('|')) {
        const formatted = formatMarkdownTable(selectedText);
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: formatted }
        });
      }
    } else {
      // カーソル位置のテーブルを自動検出して整形
      const tableRange = findTableRange(content, range.from);
      if (tableRange) {
        const formatted = formatMarkdownTable(tableRange.text);
        view.dispatch({
          changes: { from: tableRange.from, to: tableRange.to, insert: formatted }
        });
      }
    }
    view.focus();
  };

  const handlePaste = useCallback((event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;

    const table = convertTsvToMd(text);
    if (table) {
      event.preventDefault();
      const view = editorRef.current?.view;
      if (view) {
        const range = view.state.selection.main;
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: table }
        });
      }
    }
  }, []);

  // ペーストイベントリスナーの登録
  useEffect(() => {
    if (!editorReady) return;
    
    const view = editorRef.current?.view;
    if (!view) return;

    const dom = view.dom;
    dom.addEventListener('paste', handlePaste);

    return () => {
      dom.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste, editorReady]);

  // メディアレンダラー（拡張子で自動判別）
  const MediaRenderer = ({ src, alt }: { src?: string; alt?: string }) => {
    if (!src || typeof src !== 'string') return null;

    // /api/files/ がない場合は補完
    const fullSrc = src.startsWith('/api/files/') || src.startsWith('http') 
      ? src 
      : `/api/files/${src}`;

    const ext = src.split('.').pop()?.toLowerCase();
    const filename = alt || src.split('/').pop() || 'file';

    // 動画
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
      return (
        <video 
          controls 
          className="w-full max-h-[500px] rounded-lg my-4 bg-black" 
          preload="metadata"
        >
          <source src={fullSrc} />
          動画を再生できません。
        </video>
      );
    }

    // 音声
    if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext || '')) {
      return (
        <>
          <audio controls className="w-full my-2">
            <source src={fullSrc} />
            音声を再生できません。
          </audio>
          <span className="text-sm text-muted-foreground block mt-1">{filename}</span>
        </>
      );
    }

    // その他のファイル（PDF、Office、Zipなど）
    if (['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'txt', 'md', 'csv'].includes(ext || '')) {
      return (
        <span className="inline-block my-2">
          <a
            href={fullSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            <span className="text-xl">📎</span>
            <span className="font-medium">{filename}</span>
          </a>
        </span>
      );
    }

    // 画像（デフォルト）
    return (
      <img
        src={fullSrc}
        alt={alt || ''}
        className="max-w-full h-auto rounded-lg my-2"
        loading="lazy"
      />
    );
  };

  // カスタムMarkdownレンダラー
  const markdownComponents: any = {
    img: ({ node, ...props }: any) => (
      <MediaRenderer src={props.src} alt={props.alt} />
    ),
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
        <Tabs defaultValue={defaultTab} key={defaultTab} className="h-full">
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
            {/* ツールバー */}
            <div className="flex items-center gap-2 p-2 mb-2 bg-muted/50 rounded-md border">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleInsertTable}
                title="3×3のテーブルを挿入"
              >
                <Table className="w-4 h-4 mr-2" />
                テーブル挿入
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFormatTable}
                title="選択範囲またはカーソル位置のテーブルを整形"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                テーブル整形
              </Button>
              <div className="ml-auto text-xs text-muted-foreground">
                Excel/スプレッドシートからコピペでテーブル作成可能
              </div>
            </div>

            <div
              className={`h-[calc(100%-60px)] rounded-lg border ${
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
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded-lg">
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span>アップロード中...</span>
                  </div>
                </div>
              )}
              <CodeMirror
                ref={editorRef}
                value={content}
                height="100%"
                extensions={extensions}
                onChange={handleContentChange}
                onCreateEditor={() => setEditorReady(true)}
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
                  unwrapDisallowed={true}
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