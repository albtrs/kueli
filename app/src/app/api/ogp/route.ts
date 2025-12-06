import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isValidExternalUrl } from '@/lib/security';

interface OGPData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

export async function GET(request: NextRequest) {
  // 認証チェック
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  // SSRF対策: 内部ネットワークへのアクセスをブロック
  const urlValidation = isValidExternalUrl(url);
  if (!urlValidation.valid) {
    return NextResponse.json(
      { error: urlValidation.reason || 'Invalid URL' },
      { status: 400 }
    );
  }

  try {
    // URLをフェッチ
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OGPBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(5000), // 5秒タイムアウト
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 400 });
    }

    const html = await response.text();
    
    // OGPメタタグを抽出
    const ogpData: OGPData = { url };
    
    // og:title
    const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (titleMatch) {
      ogpData.title = decodeHtmlEntities(titleMatch[1]);
    } else {
      // フォールバック: <title>タグ
      const fallbackTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (fallbackTitle) {
        ogpData.title = decodeHtmlEntities(fallbackTitle[1]);
      }
    }

    // og:description
    const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    if (descMatch) {
      ogpData.description = decodeHtmlEntities(descMatch[1]);
    } else {
      // フォールバック: meta description
      const fallbackDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
      if (fallbackDesc) {
        ogpData.description = decodeHtmlEntities(fallbackDesc[1]);
      }
    }

    // og:image
    const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (imageMatch) {
      let imageUrl = imageMatch[1];
      // 相対URLを絶対URLに変換
      if (imageUrl.startsWith('/')) {
        const urlObj = new URL(url);
        imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
      }
      ogpData.image = imageUrl;
    }

    // og:site_name
    const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
    if (siteNameMatch) {
      ogpData.siteName = decodeHtmlEntities(siteNameMatch[1]);
    }

    return NextResponse.json(ogpData);
  } catch (error: unknown) {
    // ネットワークエラーの詳細をログに出さない（本番環境のノイズ軽減）
    const isNetworkError = error instanceof Error && 
      ('code' in error || error.message.includes('fetch failed'));
    
    if (!isNetworkError && process.env.NODE_ENV !== 'production') {
      console.error('OGP fetch error:', error);
    }
    
    return NextResponse.json({ error: 'Failed to fetch OGP data' }, { status: 500 });
  }
}

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
