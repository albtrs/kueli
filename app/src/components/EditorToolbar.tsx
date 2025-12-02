'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Table, Wand2, Paperclip } from 'lucide-react';

interface EditorToolbarProps {
  onInsertTable: () => void;
  onFormatTable: () => void;
  onFileSelect: (files: FileList) => void;
  isUploading?: boolean;
}

/**
 * エディタのツールバーコンポーネント
 */
export function EditorToolbar({ 
  onInsertTable, 
  onFormatTable, 
  onFileSelect,
  isUploading = false,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files);
      // 同じファイルを再選択できるようにリセット
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 md:gap-2 p-2 mb-2 bg-muted/30 rounded border text-xs md:text-sm">
      <Button
        variant="ghost"
        size="sm"
        onClick={onInsertTable}
        title="3×3のテーブルを挿入"
        className="h-7 px-2 md:h-8 md:px-3"
      >
        <Table className="w-4 h-4 md:mr-1" />
        <span className="hidden md:inline">テーブル</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onFormatTable}
        title="選択範囲またはカーソル位置のテーブルを整形"
        className="h-7 px-2 md:h-8 md:px-3"
      >
        <Wand2 className="w-4 h-4 md:mr-1" />
        <span className="hidden md:inline">整形</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFileButtonClick}
        title="ファイルを添付"
        className="h-7 px-2 md:h-8 md:px-3"
        disabled={isUploading}
      >
        <Paperclip className="w-4 h-4 md:mr-1" />
        <span className="hidden md:inline">添付</span>
      </Button>
      
      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
