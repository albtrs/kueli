'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { formatDateTimeJST } from '@/lib/utils';

interface PreviewToolbarProps {
  /** 画像を原寸大で表示するか */
  isFullSizeImages: boolean;
  /** 画像サイズ切り替えコールバック */
  onToggleImageSize: () => void;
  /** 作成日時 */
  createdAt?: Date | string;
  /** 更新日時 */
  updatedAt?: Date | string;
}

/**
 * プレビュー用オプション
 * - 画像の表示サイズを一括で切り替え
 */
export function PreviewToolbar({ 
  isFullSizeImages, 
  onToggleImageSize,
  createdAt,
  updatedAt,
}: PreviewToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-2">
      {/* 日付情報 */}
      <div className="text-xs text-muted-foreground">
        {createdAt && (
          <span>作成: {formatDateTimeJST(createdAt)}</span>
        )}
        {createdAt && updatedAt && <span className="mx-2">|</span>}
        {updatedAt && (
          <span>更新: {formatDateTimeJST(updatedAt)}</span>
        )}
      </div>
      <button
        onClick={onToggleImageSize}
        title={isFullSizeImages ? "画像を縮小表示" : "画像を拡大表示"}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
      >
        {isFullSizeImages ? (
          <>
            <Minimize2 className="w-3.5 h-3.5" />
            <span>縮小</span>
          </>
        ) : (
          <>
            <Maximize2 className="w-3.5 h-3.5" />
            <span>拡大</span>
          </>
        )}
      </button>
    </div>
  );
}
