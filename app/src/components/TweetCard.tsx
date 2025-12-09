'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { ImageGalleryModal, GalleryImage } from './ui/image-gallery-modal';

// APIから返されるツイートデータの型
interface TweetUser {
  name: string;
  screenName: string;
  profileImageUrl: string;
}

interface TweetPhoto {
  url: string;
  width: number;
  height: number;
}

interface TweetVideo {
  url: string;
  poster: string;
}

interface QuotedTweetData {
  id: string;
  text: string;
  user: TweetUser;
  photos: TweetPhoto[];
  video?: TweetVideo;
}

interface TweetData {
  id: string;
  text: string;
  user: TweetUser;
  photos: TweetPhoto[];
  video?: TweetVideo;
  quotedTweet?: QuotedTweetData;
  createdAt: string;
}

interface TweetCardProps {
  tweetId: string;
  tweetUrl: string;
  /** 画像を原寸大で表示するか */
  isFullSizeImages?: boolean;
}

// X/Twitterアイコン
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// 画像グリッド表示 - 256px基準、原寸大表示対応
function PhotoGrid({ 
  photos, 
  isFullSizeImages = false, 
  onImageClick 
}: { 
  photos: TweetPhoto[]; 
  isFullSizeImages?: boolean;
  onImageClick?: (index: number) => void;
}) {
  if (photos.length === 0) return null;
  
  // 原寸大表示なら大きく、そうでなければ256px
  const size = isFullSizeImages ? 512 : 256;
  
  return (
    <div className="mt-2 flex gap-1 flex-wrap">
      {photos.map((photo, i) => (
        <div 
          key={i} 
          className="relative rounded overflow-hidden bg-muted flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
          style={{ width: size, height: size }}
          onClick={() => onImageClick?.(i)}
        >
          <Image
            src={photo.url}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ))}
    </div>
  );
}

// 動画表示
function VideoPlayer({ video }: { video: TweetVideo }) {
  return (
    <div className="mt-2">
      <video
        src={video.url}
        poster={video.poster}
        controls
        className="rounded-lg max-w-xs max-h-48"
        preload="metadata"
      />
    </div>
  );
}

// ツイートコンテンツ（再帰的に使用）
function TweetContent({ 
  user, 
  text, 
  photos, 
  video,
  quotedTweet,
  isQuoted = false,
  isFullSizeImages = false,
  onImageClick,
  imageIndexOffset = 0,
}: { 
  user: TweetUser;
  text: string;
  photos: TweetPhoto[];
  video?: TweetVideo;
  quotedTweet?: QuotedTweetData;
  isQuoted?: boolean;
  isFullSizeImages?: boolean;
  onImageClick?: (index: number) => void;
  imageIndexOffset?: number;
}) {
  // t.coリンクを除去してテキストを整形
  const cleanedText = text
    .replace(/https?:\/\/t\.co\/\w+/g, '') // t.coリンクを削除
    .trim();
  // テキストを短縮（長すぎる場合）
  const displayText = cleanedText.length > 200 ? cleanedText.slice(0, 200) + '...' : cleanedText;
  
  return (
    <div className={isQuoted ? 'mt-2 border rounded-lg p-3 bg-muted/30' : ''}>
      {/* ユーザー情報 */}
      <div className="flex items-center gap-2">
        <Image
          src={user.profileImageUrl}
          alt={user.name}
          width={isQuoted ? 20 : 32}
          height={isQuoted ? 20 : 32}
          className="rounded-full"
          unoptimized
        />
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span className={`font-medium truncate ${isQuoted ? 'text-xs' : 'text-sm'}`}>
            {user.name}
          </span>
          <span className={`text-muted-foreground truncate ${isQuoted ? 'text-xs' : 'text-sm'}`}>
            @{user.screenName}
          </span>
        </div>
      </div>
      
      {/* テキスト */}
      {displayText && (
        <p className={`mt-1 text-muted-foreground whitespace-pre-wrap break-words ${isQuoted ? 'text-xs' : 'text-sm'}`}>
          {displayText}
        </p>
      )}
      
      {/* 画像 */}
      <PhotoGrid 
        photos={photos} 
        isFullSizeImages={isQuoted ? false : isFullSizeImages} 
        onImageClick={onImageClick ? (i) => onImageClick(i + imageIndexOffset) : undefined} 
      />
      
      {/* 動画 */}
      {video && <VideoPlayer video={video} />}
      
      {/* 引用ツイート（再帰） */}
      {quotedTweet && !isQuoted && (
        <TweetContent
          user={quotedTweet.user}
          text={quotedTweet.text}
          photos={quotedTweet.photos}
          video={quotedTweet.video}
          isQuoted
          isFullSizeImages={isFullSizeImages}
          onImageClick={onImageClick}
          imageIndexOffset={photos.length}
        />
      )}
    </div>
  );
}

export function TweetCard({ tweetId, tweetUrl, isFullSizeImages = false }: TweetCardProps) {
  const [tweet, setTweet] = useState<TweetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // 画像ギャラリー用の状態
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  
  // 画像クリックハンドラ
  const handleImageClick = useCallback((index: number) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  }, []);

  useEffect(() => {
    const fetchTweet = async () => {
      try {
        const res = await fetch(`/api/tweet?id=${tweetId}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setTweet(data);
      } catch (e) {
        console.error('Tweet fetch error:', e);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTweet();
  }, [tweetId]);
  
  // ギャラリー用の画像リスト（メインツイート + 引用ツイートの画像を結合）
  const galleryImages: GalleryImage[] = [
    ...(tweet?.photos?.map(p => ({ src: p.url, alt: '' })) || []),
    ...(tweet?.quotedTweet?.photos?.map(p => ({ src: p.url, alt: '' })) || []),
  ];

  // ローディング
  if (loading) {
    return (
      <div className="border rounded-xl p-4 bg-card">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // エラー or 取得失敗
  if (error || !tweet) {
    return (
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block border rounded-xl p-4 bg-card hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <XIcon className="h-4 w-4" />
          <span className="text-sm">ポストを表示</span>
        </div>
      </a>
    );
  }

  return (
    <div className="border rounded-xl p-4 bg-card">
      {/* ヘッダー：Xロゴ（リンク付き） */}
      <div className="flex justify-end mb-1">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Xで表示"
        >
          <XIcon className="h-4 w-4" />
        </a>
      </div>
      
      <TweetContent
        user={tweet.user}
        text={tweet.text}
        photos={tweet.photos}
        video={tweet.video}
        quotedTweet={tweet.quotedTweet}
        isFullSizeImages={isFullSizeImages}
        onImageClick={handleImageClick}
      />
      
      {/* 画像ギャラリーモーダル */}
      <ImageGalleryModal
        images={galleryImages}
        initialIndex={galleryIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </div>
  );
}
