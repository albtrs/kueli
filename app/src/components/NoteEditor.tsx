'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import dynamic from 'next/dynamic';
import { fetchNote, fetchNotes, deleteNote } from '@/actions/note';
import { Note } from '@/lib/types';
import { cn } from '@/lib/utils';
import { generateDateTimeTitle } from '@/lib/datetime';
import { createTableTemplate, formatMarkdownTable, findTableRange, convertTabsToSpaces } from '@/lib/table-utils';
import { useAutoSave, useFileUpload } from '@/hooks';
import { 
  getMarkdownExtension, 
  getLineMovementKeymap,
  createWikiLinkCompletion,
  richMarkdownTheme,
  customHighlighters,
} from '@/components/editor';
import { DashboardLayout } from '@/components/layout';
import { NoteInfoSidebar } from '@/components/NoteInfoSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditorToolbar } from '@/components/EditorToolbar';
import { PreviewToolbar } from '@/components/PreviewToolbar';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { VersionHistory } from '@/components/VersionHistory';
import { Loader2, Check, Upload, Save, Trash2, History } from 'lucide-react';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';

// CodeMirrorは動的インポート（SSR無効化）
const CodeMirror = dynamic(
  () => import('@uiw/react-codemirror').then((mod) => mod.default),
  { ssr: false }
);

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
  
  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>(isNewMode ? 'write' : 'preview');
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isFullSizeImages, setIsFullSizeImages] = useState(false);

  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // 自動保存フック
  const {
    saveStatus,
    createdNoteId,
    currentNoteId,
    scheduleSave,
    saveNow,
  } = useAutoSave({
    noteId,
    isNewMode,
    note,
    onNoteUpdate: setNote,
  });

  // ファイルアップロードフック
  const {
    isUploading,
    isDragOver,
    uploadFiles,
    handleDragOver,
    handleDragLeave,
    createDropHandler,
  } = useFileUpload({
    note,
    onNoteUpdate: setNote,
  });

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

  // エディタにテキストを挿入
  const insertTextAtCursor = useCallback((text: string) => {
    const view = editorRef.current?.view;
    if (view) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, to: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
      const newContent = view.state.doc.toString();
      setContent(newContent);
      scheduleSave(title, newContent);
      view.focus();
    } else {
      const newContent = content + text;
      setContent(newContent);
      scheduleSave(title, newContent);
    }
  }, [content, title, scheduleSave]);

  // Markdownエクステンションを読み込み
  useEffect(() => {
    const loadExtensions = async () => {
      const { EditorView } = await import('@codemirror/view');
      const markdownExt = await getMarkdownExtension();
      const wikiLinkExt = await createWikiLinkCompletion(noteTitles);
      const lineMovementKeymap = await getLineMovementKeymap();
      
      setExtensions([
        markdownExt, 
        wikiLinkExt, 
        EditorView.lineWrapping, 
        ...richMarkdownTheme,
        ...customHighlighters,
        lineMovementKeymap,
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
          const notes = await fetchNotes();
          if (isMounted) {
            setAllNotes(notes);
          }
        } else {
          const [record, notes] = await Promise.all([
            fetchNote(noteId!),
            fetchNotes()
          ]);
          
          if (!record) {
            if (isMounted) router.push('/');
            return;
          }
          
          if (isMounted) {
            setNote(record);
            setTitle(record.title);
            setContent(record.content || '');
            setAllNotes(notes);
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

  // タイトル変更ハンドラ
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    scheduleSave(newTitle, content);
  }, [content, scheduleSave]);

  // コンテンツ変更ハンドラ
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    scheduleSave(title, newContent);
  }, [title, scheduleSave]);

  // 削除ハンドラ
  const handleDelete = useCallback(async () => {
    const targetId = currentNoteId;
    if (!targetId || !confirm('このメモを削除しますか？')) return;

    try {
      await deleteNote(targetId);
      router.push('/');
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert('削除に失敗しました');
    }
  }, [currentNoteId, router]);

  // 手動保存
  const handleManualSave = useCallback(async () => {
    await saveNow(title, content);
  }, [title, content, saveNow]);

  // テーブル挿入
  const handleInsertTable = useCallback(() => {
    const tableMd = createTableTemplate(3, 3);
    const view = editorRef.current?.view;
    if (view) {
      const range = view.state.selection.main;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: '\n' + tableMd + '\n' }
      });
      view.focus();
    }
  }, []);

  // テーブル整形 & タブ→スペース変換
  const handleFormatTable = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view) return;

    const range = view.state.selection.main;
    
    if (range.from !== range.to) {
      // 選択範囲がある場合
      const selectedText = view.state.sliceDoc(range.from, range.to);
      if (selectedText.includes('|')) {
        // テーブルを含む場合はテーブル整形（タブ変換も含む）
        const formatted = formatMarkdownTable(selectedText);
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: formatted }
        });
      } else if (selectedText.includes('\t')) {
        // タブを含む場合はスペースに変換
        const formatted = convertTabsToSpaces(selectedText);
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: formatted }
        });
      }
    } else {
      // 選択範囲がない場合
      const tableRange = findTableRange(content, range.from);
      if (tableRange) {
        // カーソルがテーブル内ならテーブル整形
        const formatted = formatMarkdownTable(tableRange.text);
        view.dispatch({
          changes: { from: tableRange.from, to: tableRange.to, insert: formatted }
        });
      } else if (content.includes('\t')) {
        // テーブル外でタブがある場合は全体のタブをスペースに変換
        const formatted = convertTabsToSpaces(content);
        const docLength = view.state.doc.length;
        view.dispatch({
          changes: { from: 0, to: docLength, insert: formatted }
        });
        // コンテンツを更新
        setContent(formatted);
        scheduleSave(title, formatted);
      }
    }
    view.focus();
  }, [content, title, scheduleSave]);

  // ファイル選択ハンドラ
  const handleFileSelect = useCallback(async (fileList: FileList) => {
    const files = Array.from(fileList);
    const insertText = await uploadFiles(files);
    if (insertText) {
      insertTextAtCursor(insertText);
    }
  }, [uploadFiles, insertTextAtCursor]);

  // ドロップハンドラ
  const handleDrop = useMemo(
    () => createDropHandler(insertTextAtCursor),
    [createDropHandler, insertTextAtCursor]
  );

  // 履歴からの復元ハンドラ
  const handleRestoreVersion = useCallback((restoredTitle: string, restoredContent: string) => {
    setTitle(restoredTitle);
    setContent(restoredContent);
    setShowHistoryPanel(false);
  }, []);

  // ローディング中
  if (isLoading || status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const showDeleteButton = !isNewMode || createdNoteId;
  const isSaveDisabled = isNewMode && !createdNoteId && !content.trim();

  // 右サイドバー（プレビュータブ時のみ表示）
  const rightSidebar = activeTab === 'preview' ? (
    <NoteInfoSidebar 
      content={content}
      noteId={currentNoteId || undefined}
    />
  ) : undefined;

  return (
    <DashboardLayout rightSidebar={rightSidebar}>
      <div className="flex h-full overflow-hidden">
        {/* メインエディタエリア */}
        <div className="flex-1 flex flex-col h-full overflow-hidden pb-4">
          <div className="w-full h-full flex flex-col">
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
              
                {/* 削除ボタン */}
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
              
                {/* 履歴ボタン */}
                {currentNoteId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                    className={cn("h-8 gap-1", showHistoryPanel && "bg-muted")}
                  >
                    <History className="h-4 w-4" />
                    <span className="hidden sm:inline">履歴</span>
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

            {/* コンテンツエリア */}
            <div className="flex-1 min-h-0 relative">
              {/* 編集タブ */}
              <div className={cn(
                "h-full flex flex-col",
                activeTab !== 'write' && "hidden"
              )}>
                <EditorToolbar 
                  onInsertTable={handleInsertTable}
                  onFormatTable={handleFormatTable}
                  onFileSelect={handleFileSelect}
                  isUploading={isUploading}
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
                <div className="h-full flex flex-col">
                  <PreviewToolbar 
                    isFullSizeImages={isFullSizeImages}
                    onToggleImageSize={() => setIsFullSizeImages(!isFullSizeImages)}
                    createdAt={note?.createdAt}
                    updatedAt={note?.updatedAt}
                  />
                  <div className="flex-1 overflow-auto">
                    <MarkdownPreview 
                      content={content} 
                      permalinks={permalinks} 
                      isFullSizeImages={isFullSizeImages}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* 履歴モーダル */}
      {showHistoryPanel && currentNoteId && (
        <VersionHistory
          noteId={currentNoteId}
          onRestore={handleRestoreVersion}
          onClose={() => setShowHistoryPanel(false)}
        />
      )}
    </DashboardLayout>
  );
}
