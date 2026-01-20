'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { extractYouTubeVideoId, extractTweetId } from '@/lib/media-utils';
import { TweetCard } from '@/components/TweetCard';
import { apiFetch } from '@/lib/api';

interface OGPData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

interface LinkPreviewProps {
  href: string;
  /** 画像を原寸大で表示するか */
  isFullSizeImages?: boolean;
}

// YouTubeプレビュー
function YouTubePreview({ videoId }: { videoId: string }) {
  return (
    <div className="mt-2 rounded-lg overflow-hidden border">
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// X (Twitter) プレビュー
function TweetPreview({ tweetId, tweetUrl, isFullSizeImages }: { tweetId: string; tweetUrl: string; isFullSizeImages?: boolean }) {
  return (
    <div className="mt-2">
      <TweetCard tweetId={tweetId} tweetUrl={tweetUrl} isFullSizeImages={isFullSizeImages} />
    </div>
  );
}

// OGPプレビュー
function OGPPreview({ href }: { href: string }) {
  const [ogpData, setOgpData] = useState<OGPData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchOGP = async () => {
      try {
        const response = await apiFetch(`/api/ogp?url=${encodeURIComponent(href)}`);
        if (!response.ok) {
          setError(true);
          return;
        }
        const data = await response.json();
        setOgpData(data);
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOGP();
  }, [href]);

  if (isLoading) {
    return (
      <div className="mt-2 p-3 border rounded-lg bg-muted/30 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        プレビューを読み込み中...
      </div>
    );
  }

  if (error || !ogpData || !ogpData.title) {
    return null; // OGPが取得できない場合は何も表示しない
  }

  const domain = new URL(href).hostname;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block border rounded-lg overflow-hidden hover:bg-muted/30 transition-colors no-underline"
    >
      <div className="flex">
        {ogpData.image && (
          <div className="flex-shrink-0 w-32 md:w-48 bg-muted">
            <img
              src={ogpData.image}
              alt=""
              className="w-full h-full object-cover"
              style={{ aspectRatio: '1.91/1' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="flex-1 p-3 min-w-0">
          <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <ExternalLink className="h-3 w-3" />
            {ogpData.siteName || domain}
          </div>
          <h4 className="font-medium text-sm line-clamp-2 text-foreground mb-1">
            {ogpData.title}
          </h4>
          {ogpData.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {ogpData.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

// メインのリンクプレビューコンポーネント
export function LinkPreview({ href, isFullSizeImages }: LinkPreviewProps) {
  // URLかどうかチェック
  if (!href.startsWith('http://') && !href.startsWith('https://')) {
    return null;
  }

  // YouTube
  const youtubeId = extractYouTubeVideoId(href);
  if (youtubeId) {
    return <YouTubePreview videoId={youtubeId} />;
  }

  // X (Twitter)
  const tweetId = extractTweetId(href);
  if (tweetId) {
    return <TweetPreview tweetId={tweetId} tweetUrl={href} isFullSizeImages={isFullSizeImages} />;
  }

  // OGPプレビュー
  return <OGPPreview href={href} />;
}
