'use client';

import { useState, useEffect } from 'react';
import type { NoteVersion } from '@/lib/types';
import { fetchNoteVersions, restoreNoteVersion, deleteNoteVersion } from '@/api/notes';
import { Button } from '@/components/ui/button';
import { 
  History, 
  RotateCcw, 
  Trash2, 
  X, 
  ChevronLeft,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface VersionHistoryProps {
  noteId: string;
  onRestore?: (title: string, content: string) => void;
  onClose: () => void;
}

export function VersionHistory({ noteId, onRestore, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // バージョン一覧を取得
  useEffect(() => {
    const loadVersions = async () => {
      try {
        setIsLoading(true);
        const data = await fetchNoteVersions(noteId);
        setVersions(data);
      } catch (error) {
        console.error('Failed to load versions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadVersions();
  }, [noteId]);

  // バージョンを復元
  const handleRestore = async (version: NoteVersion) => {
    if (!confirm(`${formatDate(version.createdAt)} の版に復元しますか？\n現在の内容はバックアップされます。`)) {
      return;
    }

    try {
      setIsRestoring(true);
      const restored = await restoreNoteVersion(version.id);
      
      if (onRestore) {
        onRestore(restored.title, restored.content);
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to restore version:', error);
      alert('復元に失敗しました');
    } finally {
      setIsRestoring(false);
    }
  };

  // バージョンを削除
  const handleDelete = async (version: NoteVersion, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('このバージョンを削除しますか？')) {
      return;
    }

    try {
      await deleteNoteVersion(version.id);
      setVersions(prev => prev.filter(v => v.id !== version.id));
      if (selectedVersion?.id === version.id) {
        setSelectedVersion(null);
        setShowPreview(false);
      }
    } catch (error) {
      console.error('Failed to delete version:', error);
      alert('削除に失敗しました');
    }
  };

  // バージョン選択
  const handleSelectVersion = (version: NoteVersion) => {
    if (selectedVersion?.id === version.id) {
      // 同じバージョンをクリックしたらプレビュー表示/非表示を切り替え
      setShowPreview(!showPreview);
    } else {
      setSelectedVersion(version);
      setShowPreview(true);
    }
  };

  // プレビューを閉じる
  const handleClosePreview = () => {
    setShowPreview(false);
  };

  return (
    <>
      {/* オーバーレイ */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      
      {/* モーダル */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[80vh] bg-background rounded-lg shadow-lg z-50 flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <span className="font-semibold">履歴</span>
            <span className="text-sm text-muted-foreground">
              ({versions.length}件)
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* バージョン一覧 */}
          <div className={cn(
            "overflow-y-auto",
            showPreview && selectedVersion 
              ? "hidden md:block md:w-1/3 md:border-r" 
              : "flex-1"
          )}>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <div className="p-8 text-center">
                <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">履歴がありません</p>
                <p className="text-xs text-muted-foreground mt-1">
                  30分以上空けて編集すると履歴が作成されます
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={cn(
                      "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                      selectedVersion?.id === version.id && "bg-muted"
                    )}
                    onClick={() => handleSelectVersion(version)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {version.title || '無題'}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {formatDate(version.createdAt)}
                        </div>
                        {/* 本文プレビュー（一覧表示時のみ） */}
                        {!(showPreview && selectedVersion) && (
                          <div className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {version.content?.slice(0, 150) || '(空)'}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectVersion(version);
                          }}
                          title="プレビュー"
                        >
                          {selectedVersion?.id === version.id && showPreview ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => handleDelete(version, e)}
                          title="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* プレビューパネル */}
          {showPreview && selectedVersion && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* プレビューヘッダー */}
              <div className="p-3 border-b bg-muted/30 flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  {/* モバイル：戻るボタン */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden h-8 gap-1"
                    onClick={handleClosePreview}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    戻る
                  </Button>
                  
                  <div className="hidden md:block flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">
                      {selectedVersion.title || '無題'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(selectedVersion.createdAt)}
                    </div>
                  </div>
                  
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => handleRestore(selectedVersion)}
                    disabled={isRestoring}
                  >
                    {isRestoring ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    この版に復元
                  </Button>
                </div>
                
                {/* モバイル：タイトル表示 */}
                <div className="md:hidden mt-2">
                  <div className="font-medium truncate">
                    {selectedVersion.title || '無題'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(selectedVersion.createdAt)}
                  </div>
                </div>
              </div>
              
              {/* プレビュー本文 */}
              <div className="flex-1 overflow-y-auto p-4">
                <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">
                  {selectedVersion.content || '(空)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// 日付フォーマット
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
