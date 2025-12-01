/**
 * メディア関連のユーティリティ関数
 */

// YouTubeのURLからビデオIDを抽出
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// YouTubeのサムネイルURLを取得
export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// コンテンツからYouTubeサムネイルを抽出
export function extractYouTubeThumbnail(content: string): string | null {
  const videoId = extractYouTubeVideoId(content);
  return videoId ? getYouTubeThumbnailUrl(videoId) : null;
}

// X (Twitter) のURLからツイートIDを抽出
export function extractTweetId(url: string): string | null {
  const pattern = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;
  const match = url.match(pattern);
  return match ? match[1] : null;
}

// URLがYouTubeかどうか判定
export function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

// URLがTwitter/Xかどうか判定
export function isTwitterUrl(url: string): boolean {
  return url.includes('twitter.com') || url.includes('x.com');
}

// コンテンツから最初の外部リンクを抽出（YouTube, Twitter/X除外）
export function extractFirstExternalLink(content: string): string | null {
  // Markdownリンク形式: [text](url)
  const markdownLinkPattern = /\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let match = markdownLinkPattern.exec(content || '');
  if (match) {
    const url = match[1];
    if (!isYouTubeUrl(url) && !isTwitterUrl(url)) {
      return url;
    }
  }
  
  // プレーンURL形式
  const plainUrlPattern = /(?<!\]\()https?:\/\/[^\s<>\[\]]+/g;
  while ((match = plainUrlPattern.exec(content || '')) !== null) {
    const url = match[0];
    if (!isYouTubeUrl(url) && !isTwitterUrl(url)) {
      return url;
    }
  }
  
  return null;
}
