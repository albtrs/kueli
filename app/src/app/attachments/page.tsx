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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-4 px-6">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">添付ファイル管理</h1>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              合計: {stats.total} 件 | 使用中: {stats.used} 件 | 
              <span className={stats.unused > 0 ? 'text-amber-600 font-medium' : ''}>
                {' '}未使用: {stats.unused} 件
              </span>
            </div>
            {stats.unused > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={deleteAllUnused}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                未使用をすべて削除
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
            {error}
          </div>
        )}

        {files.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            添付ファイルはありません
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">ファイル名</th>
                  <th className="text-left px-4 py-3 font-medium w-24">サイズ</th>
                  <th className="text-left px-4 py-3 font-medium w-28">作成日</th>
                  <th className="text-left px-4 py-3 font-medium w-24">状態</th>
                  <th className="text-center px-4 py-3 font-medium w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr 
                    key={file.filename}
                    className={`border-t ${!file.isUsed ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`/api/files/${file.filename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 hover:underline text-primary"
                      >
                        <span className="truncate max-w-md">{file.filename}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(file.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {file.isUsed ? (
                        <span className="text-sm text-green-600 dark:text-green-400">使用中</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          未使用
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!file.isUsed && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteFile(file.filename)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
