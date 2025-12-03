'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';


export interface GalleryImage {
  src: string;
  alt?: string;
}

interface ImageGalleryModalProps {
  /** 表示する画像の配列 */
  images: GalleryImage[];
  /** 初期表示する画像のインデックス */
  initialIndex: number;
  /** モーダルの開閉状態 */
  isOpen: boolean;
  /** 閉じる時のコールバック */
  onClose: () => void;
}

/**
 * 画像ギャラリーモーダル
 * - デスクトップ: 中央モーダル + 左右矢印ボタン
 * - モバイル: 全画面 + スワイプでスライド
 * - キーボード操作対応（←→、Escape）
 */
export function ImageGalleryModal({
  images,
  initialIndex,
  isOpen,
  onClose,
}: ImageGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 初期インデックスが変更されたら更新
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, isOpen]);

  // 前の画像
  const goToPrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  // 次の画像
  const goToNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  // キーボード操作
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goToPrev, goToNext]);

  // スクロールを無効化
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // タッチ開始
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setTouchDelta(0);
  };

  // タッチ移動
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const currentX = e.touches[0].clientX;
    setTouchDelta(currentX - touchStart);
  };

  // タッチ終了
  const handleTouchEnd = () => {
    if (touchStart === null) return;
    
    const threshold = 50; // スワイプ判定の閾値（px）
    
    if (touchDelta > threshold) {
      goToPrev();
    } else if (touchDelta < -threshold) {
      goToNext();
    }
    
    setTouchStart(null);
    setTouchDelta(0);
  };

  // 背景クリックで閉じる
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  return (
    <div className="fixed inset-0 z-50">
      {/* オーバーレイ */}
      <div 
        className="absolute inset-0 bg-black/90"
        onClick={handleBackdropClick}
      />
      
      {/* コンテンツ */}
      <div
        ref={containerRef}
        className="relative h-full w-full flex items-center justify-center"
        onClick={handleBackdropClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="閉じる"
        >
          <X className="h-6 w-6" />
        </button>

        {/* カウンター */}
        {hasMultiple && (
          <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-full bg-black/50 text-white text-sm">
            {currentIndex + 1} / {images.length}
          </div>
        )}

        {/* 前へボタン（デスクトップのみ） */}
        {hasMultiple && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            className="hidden md:flex absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors items-center justify-center"
            aria-label="前の画像"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}

        {/* 画像 */}
        <div 
          className="relative max-w-full max-h-full p-4 md:p-12"
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: touchDelta !== 0 ? `translateX(${touchDelta}px)` : undefined,
            transition: touchDelta === 0 ? 'transform 0.3s ease' : undefined,
          }}
        >
          <img
            src={currentImage.src}
            alt={currentImage.alt || ''}
            className="max-w-full max-h-[calc(100vh-6rem)] object-contain select-none"
            draggable={false}
          />
        </div>

        {/* 次へボタン（デスクトップのみ） */}
        {hasMultiple && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="hidden md:flex absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors items-center justify-center"
            aria-label="次の画像"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        )}

        {/* ドットインジケーター（モバイル） */}
        {hasMultiple && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 md:hidden">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(index);
                }}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? "bg-white" : "bg-white/40"
                }`}
                aria-label={`画像 ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
