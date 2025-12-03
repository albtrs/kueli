'use client';

import { Maximize2, Minimize2 } from 'lucide-react';

interface PreviewToolbarProps {
  /** 画像を原寸大で表示するか */
  isFullSizeImages: boolean;
  /** 画像サイズ切り替えコールバック */
  onToggleImageSize: () => void;
}

/**
 * プレビュー用オプション
 * - 画像の表示サイズを一括で切り替え
 */
export function PreviewToolbar({ 
  isFullSizeImages, 
  onToggleImageSize,
}: PreviewToolbarProps) {
  return (
    <div className="flex items-center justify-end mb-2">
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
