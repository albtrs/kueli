'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { exportNotes, importNotes } from '@/actions/backup';
import { Download, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function BackupControls() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // メッセージを一定時間後にクリア
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // エクスポート処理
  const handleExport = async () => {
    setIsExporting(true);
    setMessage(null);

    try {
      const jsonContent = await exportNotes();
      
      // ファイル名に日付を含める
      const date = new Date().toISOString().split('T')[0];
      const filename = `notes_backup_${date}.json`;
      
      // Blobを作成してダウンロード
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      const data = JSON.parse(jsonContent);
      showMessage('success', `${data.noteCount}件のノートをエクスポートしました`);
    } catch (error) {
      console.error('Export failed:', error);
      showMessage('error', 'エクスポートに失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  // インポートボタンクリック
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // ファイル選択時の処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 確認ダイアログ
    const confirmed = window.confirm(
      '⚠️ インポートの確認\n\n' +
      '同じIDを持つノートは上書きされます。\n' +
      'この操作は元に戻せません。\n\n' +
      '続行しますか？'
    );

    if (!confirmed) {
      // ファイル選択をリセット
      e.target.value = '';
      return;
    }

    setIsImporting(true);
    setMessage(null);

    try {
      const content = await file.text();
      const result = await importNotes(content);

      if (result.success) {
        showMessage(
          'success',
          `インポート完了: ${result.created}件作成、${result.updated}件更新`
        );
        // ページをリロードして変更を反映
        window.location.reload();
      } else {
        showMessage('error', result.errors.join('\n'));
      }
    } catch (error) {
      console.error('Import failed:', error);
      showMessage('error', 'インポートに失敗しました');
    } finally {
      setIsImporting(false);
      // ファイル選択をリセット（同じファイルを再選択できるように）
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {/* エクスポートボタン */}
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isExporting || isImporting}
          className="gap-2"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export JSON
        </Button>

        {/* インポートボタン */}
        <Button
          variant="outline"
          onClick={handleImportClick}
          disabled={isExporting || isImporting}
          className="gap-2"
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Import JSON
        </Button>

        {/* 隠しファイル入力 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* メッセージ表示 */}
      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
              : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="whitespace-pre-wrap">{message.text}</span>
        </div>
      )}

      {/* 説明テキスト */}
      <p className="text-xs text-muted-foreground">
        エクスポートしたJSONファイルは、このアプリのバックアップとして保存できます。
        インポート時、同じIDのノートは上書きされます。
      </p>
    </div>
  );
}
