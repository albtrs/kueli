/**
 * LinkMetadata操作モジュール
 * URLからOGP/Twitter情報を取得し、DBに保存する
 */

import { prisma } from './prisma';
import { isValidExternalUrl } from './security';
import { extractTweetId, getUrlType, type UrlType } from './media-utils';
import { getTweet } from 'react-tweet/api';

// OGPデータの型
interface OGPData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// Twitter保存用データの型
interface StoredTweetData {
  id: string;
  text: string;
  userName: string;
  userScreenName: string;
  quotedText?: string;
  createdAt: string;
}

// LinkMetadata作成/更新用データ
interface LinkMetadataInput {
  url: string;
  type: UrlType;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  tweetData?: string;
  searchText: string;
}

/**
 * HTMLエンティティをデコード
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

/**
 * URLからOGPデータを取得
 */
async function fetchOGPData(url: string): Promise<OGPData> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; OGPBot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();
  const ogpData: OGPData = {};

  // og:title
  const titleMatch =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (titleMatch) {
    ogpData.title = decodeHtmlEntities(titleMatch[1]);
  } else {
    const fallbackTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (fallbackTitle) {
      ogpData.title = decodeHtmlEntities(fallbackTitle[1]);
    }
  }

  // og:description
  const descMatch =
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  if (descMatch) {
    ogpData.description = decodeHtmlEntities(descMatch[1]);
  } else {
    const fallbackDesc =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (fallbackDesc) {
      ogpData.description = decodeHtmlEntities(fallbackDesc[1]);
    }
  }

  // og:image
  const imageMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (imageMatch) {
    let imageUrl = imageMatch[1];
    if (imageUrl.startsWith('/')) {
      const urlObj = new URL(url);
      imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
    }
    ogpData.image = imageUrl;
  }

  // og:site_name
  const siteNameMatch =
    html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (siteNameMatch) {
    ogpData.siteName = decodeHtmlEntities(siteNameMatch[1]);
  }

  return ogpData;
}

/**
 * TwitterのURLからツイートデータを取得
 */
async function fetchTwitterData(url: string): Promise<LinkMetadataInput> {
  const tweetId = extractTweetId(url);
  if (!tweetId) {
    throw new Error('Invalid Twitter URL');
  }

  const tweet = await getTweet(tweetId);
  if (!tweet) {
    throw new Error('Tweet not found');
  }

  const tweetData: StoredTweetData = {
    id: tweet.id_str,
    text: tweet.text,
    userName: tweet.user.name,
    userScreenName: tweet.user.screen_name,
    quotedText: tweet.quoted_tweet?.text,
    createdAt: tweet.created_at,
  };

  const searchText = [
    tweet.text,
    tweet.user.name,
    tweet.user.screen_name,
    tweet.quoted_tweet?.text,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    url,
    type: 'twitter',
    title: `${tweet.user.name} (@${tweet.user.screen_name})`,
    description: tweet.text.slice(0, 200),
    tweetData: JSON.stringify(tweetData),
    searchText,
  };
}

/**
 * URLからメタデータを取得してDBに保存
 */
export async function fetchAndSaveLinkMetadata(url: string): Promise<void> {
  // セキュリティチェック
  const validation = isValidExternalUrl(url);
  if (!validation.valid) {
    await prisma.linkMetadata.update({
      where: { url },
      data: {
        errorAt: new Date(),
        errorReason: validation.reason || 'Invalid URL',
      },
    });
    return;
  }

  const urlType = getUrlType(url);

  try {
    let metadataInput: LinkMetadataInput;

    if (urlType === 'twitter') {
      metadataInput = await fetchTwitterData(url);
    } else {
      // OGP（YouTube含む）
      const ogpData = await fetchOGPData(url);
      const searchText = [ogpData.title, ogpData.description, ogpData.siteName]
        .filter(Boolean)
        .join(' ');

      metadataInput = {
        url,
        type: urlType,
        title: ogpData.title,
        description: ogpData.description,
        image: ogpData.image,
        siteName: ogpData.siteName,
        searchText,
      };
    }

    // DBを更新
    await prisma.linkMetadata.update({
      where: { url },
      data: {
        type: metadataInput.type,
        title: metadataInput.title,
        description: metadataInput.description,
        image: metadataInput.image,
        siteName: metadataInput.siteName,
        tweetData: metadataInput.tweetData,
        searchText: metadataInput.searchText,
        fetchedAt: new Date(),
        errorAt: null,
        errorReason: null,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.linkMetadata.update({
      where: { url },
      data: {
        errorAt: new Date(),
        errorReason: errorMessage,
      },
    });
  }
}

// 既存リンクの型
interface ExistingLink {
  noteId: string;
  linkMetadataId: string;
  linkMetadata: { url: string };
}

/**
 * NoteのURLを処理してLinkMetadataを作成/関連付け（差分のみ処理）
 */
export async function processNoteLinks(noteId: string, urls: string[]): Promise<void> {
  // 現在の関連URLを取得
  const existingLinks: ExistingLink[] = await prisma.noteLinkMetadata.findMany({
    where: { noteId },
    include: { linkMetadata: { select: { url: true } } },
  });
  const existingUrls = new Set(existingLinks.map((l: ExistingLink) => l.linkMetadata.url));
  const newUrls = new Set(urls);

  // 差分を計算
  const urlsToAdd = urls.filter((url) => !existingUrls.has(url));
  const linksToRemove = existingLinks.filter((l: ExistingLink) => !newUrls.has(l.linkMetadata.url));

  // 変更がなければ何もしない
  if (urlsToAdd.length === 0 && linksToRemove.length === 0) {
    return;
  }

  // 削除されたURLの関連を解除
  if (linksToRemove.length > 0) {
    await prisma.noteLinkMetadata.deleteMany({
      where: {
        noteId,
        linkMetadataId: { in: linksToRemove.map((l: ExistingLink) => l.linkMetadataId) },
      },
    });
  }

  // 新しいURLを処理
  for (const url of urlsToAdd) {
    const urlType = getUrlType(url);

    // LinkMetadataをupsert（URLが既存なら再利用）
    const linkMetadata = await prisma.linkMetadata.upsert({
      where: { url },
      create: {
        url,
        type: urlType,
      },
      update: {},
    });

    // NoteとLinkMetadataを関連付け
    await prisma.noteLinkMetadata.create({
      data: {
        noteId,
        linkMetadataId: linkMetadata.id,
      },
    });

    // メタデータ未取得の場合は非同期で取得
    if (!linkMetadata.fetchedAt && !linkMetadata.errorAt) {
      fetchAndSaveLinkMetadata(url).catch((err) => {
        console.error(`Failed to fetch metadata for ${url}:`, err);
      });
    }
  }
}

/**
 * 未取得のLinkMetadataを一括取得（バックフィル用）
 */
export async function fetchPendingLinkMetadata(limit: number = 10): Promise<number> {
  const pendingLinks = await prisma.linkMetadata.findMany({
    where: {
      fetchedAt: null,
      errorAt: null,
    },
    take: limit,
  });

  let processed = 0;
  for (const link of pendingLinks) {
    await fetchAndSaveLinkMetadata(link.url);
    processed++;
    // レート制限対策
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return processed;
}
