'use client';

import { Button } from '@/components/ui/button';
import { Table, Wand2 } from 'lucide-react';

interface EditorToolbarProps {
  onInsertTable: () => void;
  onFormatTable: () => void;
}

/**
 * エディタのツールバーコンポーネント
 */
export function EditorToolbar({ onInsertTable, onFormatTable }: EditorToolbarProps) {
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
      <div className="ml-auto text-xs text-muted-foreground hidden lg:block">
        D&Dでファイル添付
      </div>
    </div>
  );
}
