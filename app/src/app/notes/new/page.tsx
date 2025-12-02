'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { fetchNotes, saveNote as saveNoteAction } from '@/actions/note';
import { Note } from '@/lib/types';
import { extractTags } from '@/lib/utils';
import { createTableTemplate, convertTsvToMd, formatMarkdownTable, findTableRange } from '@/lib/table-utils';
import { DashboardLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorToolbar } from '@/components/EditorToolbar';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { Loader2, Check, Upload, Save } from 'lucide-react';
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

// テーマを動的インポート
const getEditorTheme = async () => {
  const { githubLight } = await import('@uiw/codemirror-theme-github');
  return githubLight;
};

// カスタムスタイルを動的インポート
const getCustomStyles = async () => {
  const { EditorView } = await import('@codemirror/view');
  return EditorView.theme({
    '&': {
      fontSize: '15px',
    },
    '.cm-content': {
      padding: '12px 16px',
      lineHeight: '1.6',
    },
    '.cm-activeLine': {
      backgroundColor: '#f0f8ff',
    },
    '.cm-header': {
      fontWeight: 'bold',
      color: '#0550ae',
    },
    '.cm-header-1': { fontSize: '1.4em' },
    '.cm-header-2': { fontSize: '1.25em' },
    '.cm-header-3': { fontSize: '1.1em' },
    '.cm-link': {
      color: '#0969da',
    },
    '.cm-strong': {
      fontWeight: 'bold',
    },
    '.cm-emphasis': {
      fontStyle: 'italic',
    },
  });
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
        
        const match = textBefore.match(/\[\[([^\]]*)$/);
        if (!match) return null;
        
        const query = match[1].toLowerCase();
        const from = context.pos - match[1].length;
        const hasClosingBrackets = textAfter.startsWith(']]');
        
        const options = noteTitles
          .filter(t => t.toLowerCase().includes(query))
          .map(title => ({
            label: title,
            apply: (view: any, completion: any, from: number, to: number) => {
              const insertText = title + ']]';
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

type SaveStatus = 'new' | 'saved' | 'saving' | 'unsaved';

export default function NewNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  // URLパラメータからタイトルを取得、なければ日時ベースのタイトル
  const initialTitle = searchParams.get('title') || generateDateTimeTitle();

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('new');
  const [extensions, setExtensions] = useState<any[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);

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

  // 日時ベースのタイトルを生成
  function generateDateTimeTitle(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // Markdownエクステンションを読み込み
  useEffect(() => {
    const loadExtensions = async () => {
      const { EditorView } = await import('@codemirror/view');
      const markdownExt = await getMarkdownExtension();
      const wikiLinkExt = await getWikiLinkCompletion(noteTitles);
      const theme = await getEditorTheme();
      const customStyles = await getCustomStyles();
      setExtensions([markdownExt, wikiLinkExt, EditorView.lineWrapping, theme, customStyles]);
    };
    loadExtensions();
  }, [noteTitles]);

  // 認証チェックと全ノート取得
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status !== 'authenticated') {
      return;
    }

    let isMounted = true;

    const loadNotes = async () => {
      try {
        const notes = await fetchNotes();
        if (isMounted) {
          setAllNotes(notes);
        }
      } catch (err) {
        console.error('Failed to fetch notes:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadNotes();

    return () => {
      isMounted = false;
    };
  }, [router, status]);

  // 保存処理（初回は新規作成、以降は更新）
  const performSave = useCallback(
    async (newTitle: string, newContent: string) => {
      // 空のコンテンツの場合は保存しない
      if (!newContent.trim() && !createdNoteId) {
        return;
      }

      setSaveStatus('saving');
      try {
        const tags = extractTags(newContent);
        
        const saved = await saveNoteAction(createdNoteId, {
          title: newTitle,
          content: newContent,
          tags,
        });
        
        // 初回保存時はIDを記録してURLを更新
        if (!createdNoteId) {
          setCreatedNoteId(saved.id);
          // URLを置き換え（戻るボタンで/notes/newに戻らないように）
          window.history.replaceState(null, '', `/notes/${saved.id}`);
        }
        
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to save note:', err);
        setSaveStatus('unsaved');
      }
    },
    [createdNoteId]
  );

  // タイトル変更ハンドラ
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (createdNoteId || content.trim()) {
      setSaveStatus('unsaved');
    }

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
    if (createdNoteId || newContent.trim()) {
      setSaveStatus('unsaved');
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      performSave(title, newContent);
    }, 1000);
  };

  // ファイルアップロード
  const uploadFile = async (file: File): Promise<{ url: string | null; error?: string }> => {
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
      
      const uploadPromises = files.map(file => uploadFile(file));
      const results = await Promise.all(uploadPromises);
      
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
      
      if (errors.length > 0) {
        alert('以下のファイルのアップロードに失敗しました:\n\n' + errors.join('\n'));
      }
      
      if (insertText) {
        const newContent = content + insertText;
        setContent(newContent);
        handleContentChange(newContent);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualSave = async () => {
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
    
    if (range.from !== range.to) {
      const selectedText = view.state.sliceDoc(range.from, range.to);
      if (selectedText.includes('|')) {
        const formatted = formatMarkdownTable(selectedText);
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: formatted }
        });
      }
    } else {
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

  if (isLoading || status === 'loading') {
    return (
      <DashboardLayout hideSidebar>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout hideSidebar>
      <div className="flex flex-col h-full overflow-hidden px-4 pb-4 md:px-6">
        <div className="max-w-5xl mx-auto w-full h-full flex flex-col">
          <Tabs defaultValue="write" className="h-full flex flex-col">
            {/* タブ + アクションボタン */}
            <div className="flex items-center justify-between py-3 gap-2">
              <TabsList>
                <TabsTrigger value="write">編集</TabsTrigger>
                <TabsTrigger value="preview">プレビュー</TabsTrigger>
              </TabsList>
              
              {/* 保存状態とアクションボタン */}
              <div className="flex items-center gap-2">
                {/* 保存状態インジケータ */}
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  {saveStatus === 'new' && <span className="hidden sm:inline">新規作成</span>}
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
                </div>
                
                {/* 保存ボタン */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleManualSave} 
                  className="h-8 gap-1"
                  disabled={saveStatus === 'new' && !content.trim()}
                >
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">保存</span>
                </Button>
              </div>
            </div>
            
            {/* タイトル入力欄 */}
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
                  className="h-full overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:h-full [&_.cm-scroller]:overflow-y-auto [&_.cm-scroller]:overflow-x-hidden"
                  basicSetup={{
                    lineNumbers: false,
                    foldGutter: false,
                    highlightActiveLine: true,
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="preview" className="flex-1 min-h-0 overflow-auto">
              <MarkdownPreview content={content} permalinks={permalinks} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
