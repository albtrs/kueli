'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';

interface FileInfo {
  filename: string;
  size: number;
  createdAt: string;
  isUsed: boolean;
}

interface FilesResponse {
  files: FileInfo[];
  totalCount: number;
  usedCount: number;
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

export default function AttachmentsPage() {
  const router = useRouter();
  const { status } = useSession();
  
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stats, setStats] = useState({ total: 0, used: 0, unused: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    
    if (status === 'authenticated') {
      fetchFiles();
    }
  }, [status, router]);

  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/attachments');
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      const data: FilesResponse = await response.json();
      setFiles(data.files);
      setStats({
        total: data.totalCount,
        used: data.usedCount,
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
      const response = await fetch('/api/attachments', {
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
      } else if (result.skipped.length > 0) {
        alert('このファイルは使用中のため削除できません');
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
    const unusedFiles = files.filter(f => !f.isUsed);
    if (unusedFiles.length === 0) {
      alert('未使用のファイルはありません');
      return;
    }
    
    if (!confirm(`未使用のファイル ${unusedFiles.length} 件をすべて削除しますか？\n\nこの操作は取り消せません。`)) return;
    
    try {
      setIsDeleting(true);
      const response = await fetch('/api/attachments', {
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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="max-w-6xl mx-auto flex h-12 items-center gap-2 px-4 md:px-6">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-medium md:text-base">添付ファイル</h1>
          <div className="ml-auto flex items-center gap-2 md:gap-4">
            <div className="hidden md:block text-xs text-muted-foreground">
              {stats.total}件 | 使用中 {stats.used} | 
              <span className={stats.unused > 0 ? 'text-amber-600 font-medium' : ''}>
                {' '}未使用 {stats.unused}
              </span>
            </div>
            {stats.unused > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                className="h-8 text-xs text-white"
                onClick={deleteAllUnused}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5 md:mr-1" />
                    <span className="hidden md:inline">未使用を削除</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">
            {error}
          </div>
        )}

        {/* モバイル用統計 */}
        <div className="md:hidden mb-4 text-xs text-muted-foreground">
          {stats.total}件 | 使用中 {stats.used} | 
          <span className={stats.unused > 0 ? 'text-amber-600 font-medium' : ''}>
            {' '}未使用 {stats.unused}
          </span>
        </div>

        {files.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            添付ファイルはありません
          </div>
        ) : (
          <>
            {/* デスクトップ用テーブル */}
            <div className="hidden md:block border rounded overflow-hidden">
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
                      className={`border-t ${!file.isUsed ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
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
                        {file.isUsed ? (
                          <span className="text-xs text-green-600 dark:text-green-400">使用中</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            未使用
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!file.isUsed && (
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

            {/* モバイル用リスト */}
            <div className="md:hidden space-y-2">
              {files.map((file) => (
                <div 
                  key={file.filename}
                  className={`border rounded p-3 ${!file.isUsed ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : ''}`}
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
                    {!file.isUsed && (
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
                    {file.isUsed ? (
                      <span className="text-green-600 dark:text-green-400">使用中</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        未使用
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
