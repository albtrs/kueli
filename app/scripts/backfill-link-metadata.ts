#!/usr/bin/env npx ts-node
/**
 * LinkMetadata バックフィルスクリプト
 *
 * 既存のメモからURLを抽出し、LinkMetadataテーブルに登録して
 * OGP/Twitter情報を取得します。
 *
 * 使い方:
 *   docker compose exec app npx ts-node scripts/backfill-link-metadata.ts
 *
 * オプション:
 *   --dry-run    実際には保存せず、処理内容を表示のみ
 *   --limit=N    処理するメモの最大数（デフォルト: 全件）
 *   --delay=N    URL取得間の待機時間（ms、デフォルト: 500）
 */

import { PrismaClient } from '@prisma/client';
import { getTweet } from 'react-tweet/api';

const prisma = new PrismaClient();

// コマンドライン引数の解析
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
const delayArg = args.find((a) => a.startsWith('--delay='));
const delay = delayArg ? parseInt(delayArg.split('=')[1], 10) : 500;

// URL種別
type UrlType = 'twitter' | 'youtube' | 'ogp';

function isTwitterUrl(url: string): boolean {
  return url.includes('twitter.com') || url.includes('x.com');
}

function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function getUrlType(url: string): UrlType {
  if (isTwitterUrl(url)) return 'twitter';
  if (isYouTubeUrl(url)) return 'youtube';
  return 'ogp';
}

function extractTweetId(url: string): string | null {
  const pattern = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;
  const match = url.match(pattern);
  return match ? match[1] : null;
}

// URLを抽出
function extractAllUrls(content: string): string[] {
  const urls = new Set<string>();

  // Markdownリンク形式: [text](url)
  const markdownLinkPattern = /\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = markdownLinkPattern.exec(content || '')) !== null) {
    urls.add(normalizeUrl(match[1]));
  }

  // プレーンURL形式
  const plainUrlPattern = /(?<!\]\()https?:\/\/[^\s<>\[\]()]+/g;
  while ((match = plainUrlPattern.exec(content || '')) !== null) {
    urls.add(normalizeUrl(match[0]));
  }

  return Array.from(urls);
}

function normalizeUrl(url: string): string {
  try {
    url = url.replace(/[.,;:!?]+$/, '');
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return url;
  }
}

// HTMLエンティティをデコード
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

// OGPデータを取得
async function fetchOGPData(
  url: string
): Promise<{ title?: string; description?: string; image?: string; siteName?: string }> {
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
  const ogpData: { title?: string; description?: string; image?: string; siteName?: string } = {};

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

// メタデータを取得
async function fetchMetadata(url: string, urlType: UrlType) {
  if (urlType === 'twitter') {
    const tweetId = extractTweetId(url);
    if (!tweetId) throw new Error('Invalid Twitter URL');

    const tweet = await getTweet(tweetId);
    if (!tweet) throw new Error('Tweet not found');

    const tweetData = {
      id: tweet.id_str,
      text: tweet.text,
      userName: tweet.user.name,
      userScreenName: tweet.user.screen_name,
      quotedText: tweet.quoted_tweet?.text,
      createdAt: tweet.created_at,
    };

    const searchText = [tweet.text, tweet.user.name, tweet.user.screen_name, tweet.quoted_tweet?.text]
      .filter(Boolean)
      .join(' ');

    return {
      title: `${tweet.user.name} (@${tweet.user.screen_name})`,
      description: tweet.text.slice(0, 200),
      tweetData: JSON.stringify(tweetData),
      searchText,
    };
  } else {
    const ogpData = await fetchOGPData(url);
    const searchText = [ogpData.title, ogpData.description, ogpData.siteName].filter(Boolean).join(' ');

    return {
      title: ogpData.title,
      description: ogpData.description,
      image: ogpData.image,
      siteName: ogpData.siteName,
      searchText,
    };
  }
}

async function main() {
  console.log('🔗 LinkMetadata Backfill Script\n');

  if (dryRun) {
    console.log('⚠️  Dry run mode - no changes will be made\n');
  }

  // 全メモを取得
  const notes = await prisma.note.findMany({
    select: { id: true, content: true, title: true },
    ...(limit && { take: limit }),
  });

  console.log(`📝 Found ${notes.length} notes to process\n`);

  let totalUrls = 0;
  let processedUrls = 0;
  let successUrls = 0;
  let errorUrls = 0;

  for (const note of notes) {
    const urls = extractAllUrls(note.content);
    if (urls.length === 0) continue;

    console.log(`\n📄 Note: "${note.title || '無題'}" (${note.id})`);
    console.log(`   Found ${urls.length} URL(s)`);

    for (const url of urls) {
      totalUrls++;
      const urlType = getUrlType(url);

      console.log(`   - [${urlType}] ${url.slice(0, 60)}${url.length > 60 ? '...' : ''}`);

      if (dryRun) continue;

      try {
        // LinkMetadataをupsert
        const existing = await prisma.linkMetadata.findUnique({ where: { url } });

        if (existing?.fetchedAt) {
          console.log(`     ⏭️  Already fetched, skipping`);
          continue;
        }

        const linkMetadata = await prisma.linkMetadata.upsert({
          where: { url },
          create: { url, type: urlType },
          update: {},
        });

        // NoteとLinkMetadataを関連付け
        await prisma.noteLinkMetadata.upsert({
          where: {
            noteId_linkMetadataId: {
              noteId: note.id,
              linkMetadataId: linkMetadata.id,
            },
          },
          create: {
            noteId: note.id,
            linkMetadataId: linkMetadata.id,
          },
          update: {},
        });

        // メタデータを取得
        if (!existing?.fetchedAt && !existing?.errorAt) {
          try {
            const metadata = await fetchMetadata(url, urlType);

            await prisma.linkMetadata.update({
              where: { url },
              data: {
                type: urlType,
                title: metadata.title,
                description: metadata.description,
                image: 'image' in metadata ? metadata.image : undefined,
                siteName: 'siteName' in metadata ? metadata.siteName : undefined,
                tweetData: 'tweetData' in metadata ? metadata.tweetData : undefined,
                searchText: metadata.searchText,
                fetchedAt: new Date(),
                errorAt: null,
                errorReason: null,
              },
            });

            console.log(`     ✅ Fetched: "${metadata.title?.slice(0, 40) || '(no title)'}..."`);
            successUrls++;
          } catch (fetchError) {
            const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
            await prisma.linkMetadata.update({
              where: { url },
              data: {
                errorAt: new Date(),
                errorReason: errorMessage,
              },
            });
            console.log(`     ❌ Error: ${errorMessage}`);
            errorUrls++;
          }
        }

        processedUrls++;

        // レート制限対策
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error) {
        console.log(`     ❌ DB Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        errorUrls++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Total URLs found: ${totalUrls}`);
  if (!dryRun) {
    console.log(`   Processed: ${processedUrls}`);
    console.log(`   Success: ${successUrls}`);
    console.log(`   Errors: ${errorUrls}`);
  }
  console.log('='.repeat(50));

  await prisma.$disconnect();
  console.log('\n✅ Backfill complete!');
}

main().catch(async (e) => {
  console.error('Backfill failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
