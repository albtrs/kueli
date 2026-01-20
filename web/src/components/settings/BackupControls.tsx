'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { exportNotes, importNotes } from '@/api/backup';
import { apiFetch } from '@/lib/api';
import { Download, Upload, Loader2, CheckCircle, AlertCircle, FileArchive, Image } from 'lucide-react';

export function BackupControls() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingAttachments, setIsExportingAttachments] = useState(false);
  const [isImportingAttachments, setIsImportingAttachments] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // メッセージを一定時間後にクリア
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ノートエクスポート処理
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
      const versionInfo = data.versionCount ? `、履歴 ${data.versionCount}件` : '';
      showMessage('success', `${data.noteCount}件のノート${versionInfo}をエクスポートしました`);
    } catch (error) {
      console.error('Export failed:', error);
      showMessage('error', 'エクスポートに失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  // ノートインポートボタンクリック
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // ノートファイル選択時の処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 確認ダイアログ
    const confirmed = window.confirm(
      '⚠️ インポートの確認\n\n' +
      '同じIDを持つノートは上書きされます。\n' +
      'バージョン履歴も含まれている場合は復元されます。\n' +
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
        const versionInfo = result.versionsCreated ? `、履歴 ${result.versionsCreated}件復元` : '';
        showMessage(
          'success',
          `インポート完了: ${result.created}件作成、${result.updated}件更新${versionInfo}`
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

  // 添付ファイルエクスポート処理
  const handleExportAttachments = async () => {
    setIsExportingAttachments(true);
    setMessage(null);

    try {
      const response = await apiFetch('/api/attachments/export');
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'エクスポートに失敗しました');
      }
      
      // ダウンロード
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Content-Dispositionからファイル名を取得
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'attachments_backup.zip';
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      showMessage('success', '添付ファイルをエクスポートしました');
    } catch (error) {
      console.error('Attachment export failed:', error);
      showMessage('error', error instanceof Error ? error.message : '添付ファイルのエクスポートに失敗しました');
    } finally {
      setIsExportingAttachments(false);
    }
  };

  // 添付ファイルインポートボタンクリック
  const handleImportAttachmentsClick = () => {
    attachmentInputRef.current?.click();
  };

  // 添付ファイル選択時の処理
  const handleAttachmentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 確認ダイアログ
    const confirmed = window.confirm(
      '⚠️ インポートの確認\n\n' +
      '同じ名前のファイルは上書きされます。\n' +
      'この操作は元に戻せません。\n\n' +
      '続行しますか？'
    );

    if (!confirmed) {
      e.target.value = '';
      return;
    }

    setIsImportingAttachments(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiFetch('/api/attachments/import', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();

      const failed = Array.isArray(result.failed) ? result.failed : [];
      const skipped = Array.isArray(result.skipped) ? result.skipped : [];

      if (failed.length > 0) {
        const details = failed
          .slice(0, 3)
          .map((item: { filename?: string; reason?: string }) => {
            const name = item.filename || 'unknown';
            const reason = item.reason || 'unknown error';
            return `${name}: ${reason}`;
          })
          .join(' / ');
        const more = failed.length > 3 ? ` 他${failed.length - 3}件` : '';
        showMessage(
          'error',
          `添付ファイルのインポートに失敗したファイルがあります: ${details}${more}`
        );
      } else if (result.success) {
        const skippedInfo = skipped.length > 0 ? `、スキップ ${skipped.length}件` : '';
        showMessage(
          'success',
          `添付ファイルインポート完了: ${result.totalImported}件${skippedInfo}`
        );
      } else {
        showMessage('error', result.error || 'インポートに失敗しました');
      }
    } catch (error) {
      console.error('Attachment import failed:', error);
      showMessage('error', '添付ファイルのインポートに失敗しました');
    } finally {
      setIsImportingAttachments(false);
      e.target.value = '';
    }
  };

  const isAnyLoading = isExporting || isImporting || isExportingAttachments || isImportingAttachments;

  return (
    <div className="space-y-6">
      {/* ノートバックアップ */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <FileArchive className="h-4 w-4" />
          ノートデータ
        </h3>
        <div className="flex flex-wrap gap-3">
          {/* エクスポートボタン */}
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isAnyLoading}
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
            disabled={isAnyLoading}
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
        <p className="text-xs text-muted-foreground">
          ノートとバージョン履歴をJSON形式でバックアップできます。
        </p>
      </div>

      {/* 添付ファイルバックアップ */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Image className="h-4 w-4" />
          添付ファイル
        </h3>
        <div className="flex flex-wrap gap-3">
          {/* エクスポートボタン */}
          <Button
            variant="outline"
            onClick={handleExportAttachments}
            disabled={isAnyLoading}
            className="gap-2"
          >
            {isExportingAttachments ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export ZIP
          </Button>

          {/* インポートボタン */}
          <Button
            variant="outline"
            onClick={handleImportAttachmentsClick}
            disabled={isAnyLoading}
            className="gap-2"
          >
            {isImportingAttachments ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import ZIP
          </Button>

          {/* 隠しファイル入力 */}
          <input
            ref={attachmentInputRef}
            type="file"
            accept=".zip"
            onChange={handleAttachmentFileChange}
            className="hidden"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          アップロードした添付ファイルをZIP形式でバックアップできます。
        </p>
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
    </div>
  );
}
