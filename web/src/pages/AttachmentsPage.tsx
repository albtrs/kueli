'use client';

import { Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/hooks/useSession';
import { apiFetch } from '@/lib/api';
import { DashboardLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, ExternalLink, AlertTriangle, History, CheckCircle } from 'lucide-react';

type FileUsageStatus = 'current' | 'history' | 'unused';

interface FileInfo {
  filename: string;
  size: number;
  createdAt: string;
  status: FileUsageStatus;
  inCurrent: boolean;
  inHistory: boolean;
}

interface FilesResponse {
  files: FileInfo[];
  totalCount: number;
  currentCount: number;
  historyCount: number;
  unusedCount: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function StatusBadge({ status, inHistory }: { status: FileUsageStatus; inHistory: boolean }) {
  if (status === 'current') {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          使用中
        </span>
        {inHistory && (
          <span className="text-[10px] text-muted-foreground">+履歴</span>
        )}
      </div>
    );
  }

  if (status === 'history') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
        <History className="h-3 w-3" />
        履歴のみ
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3" />
      未使用
    </span>
  );
}

function AttachmentsPageContent() {
  const navigate = useNavigate();
  const { status } = useSession();

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stats, setStats] = useState({ total: 0, current: 0, history: 0, unused: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate('/login', { replace: true });
      return;
    }

    if (status === 'authenticated') {
      fetchFiles();
    }
  }, [status, navigate]);

  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiFetch('/api/attachments');
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      const data: FilesResponse = await response.json();
      setFiles(data.files);
      setStats({
        total: data.totalCount,
        current: data.currentCount,
        history: data.historyCount,
        unused: data.unusedCount,
      });
    } catch (e) {
      setError('ファイル一覧の取得に失敗しました');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteFile = async (filename: string) => {
    if (!confirm(`「${filename}」を削除しますか？`)) return;

    try {
      setIsDeleting(true);
      const response = await apiFetch('/api/attachments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: [filename] }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      const result = await response.json();
      if (result.deleted.length > 0) {
        await fetchFiles();
      } else if (result.skippedCurrent.length > 0) {
        alert('このファイルは現在使用中のため削除できません');
      } else if (result.skippedHistory.length > 0) {
        alert('このファイルは履歴で使用中のため削除できません');
      } else {
        alert('削除に失敗しました');
      }
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteAllUnused = async () => {
    const unusedFiles = files.filter(f => f.status === 'unused');
    if (unusedFiles.length === 0) {
      alert('未使用のファイルはありません');
      return;
    }

    if (!confirm(`未使用のファイル ${unusedFiles.length} 件をすべて削除しますか？\n\nこの操作は取り消せません。`)) return;

    try {
      setIsDeleting(true);
      const response = await apiFetch('/api/attachments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: unusedFiles.map(f => f.filename) }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete files');
      }

      const result = await response.json();
      alert(`${result.deleted.length} 件のファイルを削除しました`);
      await fetchFiles();
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-4 py-6 md:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">添付ファイル</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {stats.total}件 |
                <span className="text-green-600"> 使用中 {stats.current}</span> |
                <span className="text-blue-600"> 履歴 {stats.history}</span> |
                <span className={stats.unused > 0 ? 'text-amber-600 font-medium' : ''}>
                  未使用 {stats.unused}
                </span>
              </p>
            </div>
            {stats.unused > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="text-xs text-white"
                onClick={deleteAllUnused}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    <span className="hidden sm:inline">未使用を削除</span>
                    <span className="sm:hidden">削除</span>
                  </>
                )}
              </Button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">
              {error}
            </div>
          )}

          {files.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              添付ファイルはありません
            </div>
          ) : (
            <>
              <div className="hidden md:block border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">ファイル名</th>
                      <th className="text-left px-3 py-2 font-medium w-20">サイズ</th>
                      <th className="text-left px-3 py-2 font-medium w-24">作成日</th>
                      <th className="text-left px-3 py-2 font-medium w-20">状態</th>
                      <th className="text-center px-3 py-2 font-medium w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr
                        key={file.filename}
                        className={`border-t ${file.status === 'unused' ? 'bg-amber-50 dark:bg-amber-950/20' : file.status === 'history' ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <a
                            href={`/api/files/${file.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 hover:underline text-primary"
                          >
                            <span className="truncate max-w-xs">{file.filename}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {formatFileSize(file.size)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {formatDate(file.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={file.status} inHistory={file.inHistory} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {file.status === 'unused' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => deleteFile(file.filename)}
                              disabled={isDeleting}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {files.map((file) => (
                  <div
                    key={file.filename}
                    className={`border rounded-lg p-3 ${
                      file.status === 'unused'
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                        : file.status === 'history'
                          ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                          : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={`/api/files/${file.filename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate flex-1"
                      >
                        {file.filename}
                      </a>
                      {file.status === 'unused' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          onClick={() => deleteFile(file.filename)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{formatFileSize(file.size)}</span>
                      <span>{formatDate(file.createdAt)}</span>
                      <StatusBadge status={file.status} inHistory={file.inHistory} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export function AttachmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AttachmentsPageContent />
    </Suspense>
  );
}
