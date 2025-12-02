'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { fetchNote, fetchNotes, saveNote as saveNoteAction, deleteNote } from '@/actions/note';
import { Note } from '@/lib/types';
import { extractTags, cn } from '@/lib/utils';
import { createTableTemplate, convertTsvToMd, formatMarkdownTable, findTableRange } from '@/lib/table-utils';
import { DashboardLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditorToolbar } from '@/components/EditorToolbar';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { Loader2, Check, Upload, Save, Trash2 } from 'lucide-react';
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

// リッチMarkdownテーマを動的インポート
const getRichMarkdownTheme = async () => {
  const { richMarkdownTheme } = await import('@/components/editor/theme-extension');
  return richMarkdownTheme;
};

// カスタムハイライター（タグ、Wikiリンク）を動的インポート
const getCustomHighlighters = async () => {
  const { customHighlighters } = await import('@/components/editor/extensions');
  return customHighlighters;
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

type SaveStatus = 'new' | 'saved' | 'saving' | 'unsaved';

interface NoteEditorProps {
  /** 既存ノートのID。nullの場合は新規作成モード */
  noteId: string | null;
  /** 新規作成時の初期タイトル（オプション） */
  initialTitle?: string;
}

export function NoteEditor({ noteId, initialTitle }: NoteEditorProps) {
  const router = useRouter();
  const { status } = useSession();
  
  const isNewMode = noteId === null;

  // ノート状態
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState(initialTitle || (isNewMode ? generateDateTimeTitle() : ''));
  const [content, setContent] = useState('');
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  
  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(isNewMode ? 'new' : 'saved');
  const [extensions, setExtensions] = useState<any[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // 新規作成時は編集モード、編集時はプレビューモードをデフォルトに
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>(isNewMode ? 'write' : 'preview');
  const [editorReady, setEditorReady] = useState(false);
  const [allNotes, setAllNotes] = useState<Note[]>([]);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // 現在のノートID（新規作成後は createdNoteId を使用）
  const currentNoteId = createdNoteId || noteId;

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

  // Markdownエクステンションを読み込み
  useEffect(() => {
    const loadExtensions = async () => {
      const { EditorView } = await import('@codemirror/view');
      const markdownExt = await getMarkdownExtension();
      const wikiLinkExt = await getWikiLinkCompletion(noteTitles);
      const richTheme = await getRichMarkdownTheme();
      const customExt = await getCustomHighlighters();
      setExtensions([
        markdownExt, 
        wikiLinkExt, 
        EditorView.lineWrapping, 
        ...richTheme,
        ...customExt,  // タグとWikiリンクのハイライト
      ]);
    };
    loadExtensions();
  }, [noteTitles]);

  // 認証チェックとデータ取得
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status !== 'authenticated') {
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      try {
        if (isNewMode) {
          // 新規作成モード: 全ノートのみ取得
          const notes = await fetchNotes();
          if (isMounted) {
            setAllNotes(notes);
          }
        } else {
          // 編集モード: ノートと全ノートを並列取得
          const [record, notes] = await Promise.all([
            fetchNote(noteId!),
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
            // 編集モードでは常に編集タブをデフォルトに
            // （プレビューを見たい場合はユーザーが手動で切り替える）
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch data:', err);
          router.push('/');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [noteId, isNewMode, router, status]);

  // 保存処理
  const performSave = useCallback(
    async (newTitle: string, newContent: string) => {
      // 新規作成モードで空のコンテンツの場合は保存しない
      if (isNewMode && !newContent.trim() && !createdNoteId) {
        return;
      }

      // 編集モードでノートがまだ読み込まれていない場合はスキップ
      if (!isNewMode && !note) return;

      setSaveStatus('saving');
      try {
        const tags = extractTags(newContent);
        
        const saved = await saveNoteAction(currentNoteId, {
          title: newTitle,
          content: newContent,
          tags,
        });
        
        // 新規作成の初回保存時
        if (isNewMode && !createdNoteId) {
          setCreatedNoteId(saved.id);
          setNote(saved);
          // URLを置き換え（戻るボタンで/notes/newに戻らないように）
          window.history.replaceState(null, '', `/notes/${saved.id}`);
        } else {
          setNote(saved);
        }
        
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to save note:', err);
        setSaveStatus('unsaved');
      }
    },
    [isNewMode, note, currentNoteId, createdNoteId]
  );

  // タイトル変更ハンドラ
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    
    // 保存が必要かどうかを判定
    const needsSave = !isNewMode || createdNoteId || content.trim();
    if (needsSave) {
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
    
    const needsSave = !isNewMode || createdNoteId || newContent.trim();
    if (needsSave) {
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
      
      // 既存ノートの場合はimagesを更新
      if (note) {
        const updatedImages = [...(note.images || []), data.filename];
        const updated = await saveNoteAction(note.id, {
          ...note,
          images: updatedImages,
        });
        setNote(updated);
      }

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

  // 削除ハンドラ（編集モードのみ）
  const handleDelete = async () => {
    const targetId = currentNoteId;
    if (!targetId || !confirm('このメモを削除しますか？')) return;

    try {
      await deleteNote(targetId);
      router.push('/');
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert('削除に失敗しました');
    }
  };

  // 手動保存
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

  // TSVペースト処理
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

  // ローディング中
  if (isLoading || status === 'loading') {
    return (
      <DashboardLayout hideSidebar>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  // 削除ボタンを表示するかどうか
  const showDeleteButton = !isNewMode || createdNoteId;
  // 保存ボタンを無効にするかどうか
  const isSaveDisabled = isNewMode && !createdNoteId && !content.trim();

  return (
    <DashboardLayout hideSidebar>
      <div className="flex flex-col h-full overflow-hidden px-4 pb-4 md:px-6">
        <div className="max-w-5xl mx-auto w-full h-full flex flex-col">
          {/* タブ + アクションボタン */}
          <div className="flex items-center justify-between py-3 gap-2">
            {/* タブ切り替えボタン */}
            <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
              <button
                onClick={() => setActiveTab('write')}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  activeTab === 'write' 
                    ? "bg-background text-foreground shadow" 
                    : "hover:bg-background/50"
                )}
              >
                編集
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  activeTab === 'preview' 
                    ? "bg-background text-foreground shadow" 
                    : "hover:bg-background/50"
                )}
              >
                プレビュー
              </button>
            </div>
            
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
                disabled={isSaveDisabled}
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">保存</span>
              </Button>
              
              {/* 削除ボタン（新規作成の未保存時は非表示） */}
              {showDeleteButton && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleDelete} 
                  className="h-8 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">削除</span>
                </Button>
              )}
            </div>
          </div>
          
          {/* タイトル入力欄 */}
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="タイトル"
            className="mb-3 text-xl md:text-2xl font-bold border-none focus-visible:ring-0 px-0"
          />

          {/* コンテンツエリア: エディタは常にレンダリングし、CSSで表示/非表示を切り替え */}
          <div className="flex-1 min-h-0 relative">
            {/* 編集タブ: 常にレンダリング、プレビュー時はhidden */}
            <div className={cn(
              "h-full flex flex-col",
              activeTab !== 'write' && "hidden"
            )}>
              {/* ツールバー */}
              <EditorToolbar 
                onInsertTable={handleInsertTable}
                onFormatTable={handleFormatTable}
              />

              <div
                className={cn(
                  "relative flex-1 min-h-0 rounded-sm border transition-colors overflow-hidden",
                  isDragOver ? 'border-primary border-2 bg-primary/5' : 'border-input'
                )}
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
            </div>

            {/* プレビュータブ */}
            {activeTab === 'preview' && (
              <div className="h-full overflow-auto">
                <MarkdownPreview content={content} permalinks={permalinks} />
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
