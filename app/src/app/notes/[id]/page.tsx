'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { fetchNote, fetchNotes } from '@/actions/note';
import { saveNote as saveNoteAction, deleteNote } from '@/actions/note';
import { Note } from '@/lib/types';
import { extractTags } from '@/lib/utils';
import { createTableTemplate, convertTsvToMd, formatMarkdownTable, findTableRange } from '@/lib/table-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorToolbar } from '@/components/EditorToolbar';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { ArrowLeft, Loader2, Check, Upload } from 'lucide-react';
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

// Wikiリンク用オートコンプリート
const getWikiLinkCompletion = async (noteTitles: string[]) => {
  const { autocompletion } = await import('@codemirror/autocomplete');
  
  return autocompletion({
    activateOnTyping: true,
    override: [
      (context: any) => {
        const line = context.state.doc.lineAt(context.pos);
        const textBefore = line.text.slice(0, context.pos - line.from);
        const textAfter = line.text.slice(context.pos - line.from);
        
        // [[ の後にいるかチェック
        const match = textBefore.match(/\[\[([^\]]*)$/);
        if (!match) return null;
        
        const query = match[1].toLowerCase();
        const from = context.pos - match[1].length;
        
        // 後ろに ]] があるかチェック
        const hasClosingBrackets = textAfter.startsWith(']]');
        
        // フィルタリング
        const options = noteTitles
          .filter(t => t.toLowerCase().includes(query))
          .map(title => ({
            label: title,
            // apply を関数にして、後ろの ]] を考慮
            apply: (view: any, completion: any, from: number, to: number) => {
              // 常に title + ']]' を挿入
              const insertText = title + ']]';
              // 後ろに ]] がある場合はそれも含めて削除
              const deleteTo = hasClosingBrackets ? to + 2 : to;
              view.dispatch({
                changes: { from, to: deleteTo, insert: insertText },
                selection: { anchor: from + insertText.length },
              });
            },
          }));
        
        if (options.length === 0) return null;
        
        return {
          from,
          options,
        };
      },
    ],
  });
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
  const [allNotes, setAllNotes] = useState<Note[]>([]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // タイトル → ID のマッピング辞書（Wikiリンク用）
  const permalinks = useMemo(() => {
    const map: Record<string, string> = {};
    allNotes.forEach(n => {
      if (n.title) {
        map[n.title] = n.id;
      }
    });
    return map;
  }, [allNotes]);

  // ノートタイトル一覧（オートコンプリート用）
  const noteTitles = useMemo(() => {
    return allNotes.map(n => n.title).filter(Boolean);
  }, [allNotes]);

  // Markdownエクステンションを読み込み（ノートタイトルが更新されたら再読み込み）
  useEffect(() => {
    const loadExtensions = async () => {
      const markdownExt = await getMarkdownExtension();
      const wikiLinkExt = await getWikiLinkCompletion(noteTitles);
      setExtensions([markdownExt, wikiLinkExt]);
    };
    loadExtensions();
  }, [noteTitles]);

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

    const fetchNoteData = async () => {
      try {
        // 現在のノートと全ノート（Wikiリンク用）を並列で取得
        const [record, notes] = await Promise.all([
          fetchNote(noteId),
          fetchNotes()
        ]);
        
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
          setAllNotes(notes);
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

    fetchNoteData();

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
          <div className="max-w-5xl mx-auto flex h-14 items-center gap-2 px-4 md:px-6">
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
              <Button variant="destructive" size="sm" onClick={handleDelete} className="text-white">
                削除
              </Button>
            </div>
          </div>
        </header>

        {/* Editor */}
        <main className="flex-1 overflow-hidden px-4 pb-4 md:px-6">
        <div className="max-w-5xl mx-auto h-full">
        <Tabs defaultValue={defaultTab} key={defaultTab} className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-3">
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
            className="mb-3 text-xl md:text-2xl font-bold border-none focus-visible:ring-0 px-0"
          />

          <TabsContent value="write" className="flex-1 min-h-0 flex flex-col">
            {/* ツールバー */}
            <EditorToolbar 
              onInsertTable={handleInsertTable}
              onFormatTable={handleFormatTable}
            />

            <div
              className={`relative flex-1 min-h-0 rounded-sm border transition-colors overflow-hidden ${
                isDragOver ? 'border-primary border-2 bg-primary/5' : 'border-input'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded">
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <Upload className="h-8 w-8" />
                    <span>ファイルをドロップ</span>
                  </div>
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded">
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
                className="h-full overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:h-full [&_.cm-scroller]:overflow-y-auto [&_.cm-scroller]:overflow-x-hidden [&_.cm-content]:py-2 [&_.cm-content]:px-3"
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 min-h-0 overflow-auto">
            <div className="prose prose-base dark:prose-invert max-w-none rounded border border-input p-4" style={{ fontFamily: 'var(--font-noto-sans-jp), sans-serif' }}>
              <MarkdownPreview content={content} permalinks={permalinks} />
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </main>
      </div>
    </div>
  );
}