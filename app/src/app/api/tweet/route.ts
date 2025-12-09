import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTweet } from 'react-tweet/api';

// ツイートユーザー情報
interface TweetUser {
  name: string;
  screenName: string;
  profileImageUrl: string;
}

// ツイート画像
interface TweetPhoto {
  url: string;
  width: number;
  height: number;
}

// ツイート動画
interface TweetVideo {
  url: string;
  poster: string;
}

// 引用ツイート
interface QuotedTweetData {
  id: string;
  text: string;
  user: TweetUser;
  photos: TweetPhoto[];
  video?: TweetVideo;
}

// メインツイートデータ
export interface TweetData {
  id: string;
  text: string;
  user: TweetUser;
  photos: TweetPhoto[];
  video?: TweetVideo;
  quotedTweet?: QuotedTweetData;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  // 認証チェック
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Tweet ID is required' }, { status: 400 });
  }

  try {
    const tweet = await getTweet(id);
    
    if (!tweet) {
      return NextResponse.json({ error: 'Tweet not found' }, { status: 404 });
    }

    // 画像情報を抽出（動画がある場合は空配列）
    const extractPhotos = (t: typeof tweet): TweetPhoto[] => {
      // 動画がある場合は画像を返さない
      if (t.video) {
        return [];
      }
      if (t.photos && t.photos.length > 0) {
        return t.photos.map(p => ({
          url: p.url,
          width: p.width,
          height: p.height,
        }));
      }
      // メディア詳細から
      if (t.mediaDetails && t.mediaDetails.length > 0) {
        return t.mediaDetails
          .filter(m => m.media_url_https && m.type === 'photo')
          .map(m => ({
            url: m.media_url_https,
            width: m.original_info?.width || 0,
            height: m.original_info?.height || 0,
          }));
      }
      return [];
    };

    // 動画情報を抽出
    const extractVideo = (t: typeof tweet): TweetVideo | undefined => {
      if (t.video) {
        // 最高品質のmp4を取得
        const variants = t.video.variants || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mp4Variants = (variants as any[])
          .filter((v) => v.type === 'video/mp4')
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const bestVariant = mp4Variants[0] || variants[0];
        
        if (bestVariant?.src) {
          return {
            url: bestVariant.src,
            poster: t.video.poster || '',
          };
        }
      }
      return undefined;
    };

    const tweetData: TweetData = {
      id: tweet.id_str,
      text: tweet.text,
      user: {
        name: tweet.user.name,
        screenName: tweet.user.screen_name,
        profileImageUrl: tweet.user.profile_image_url_https,
      },
      photos: extractPhotos(tweet),
      video: extractVideo(tweet),
      createdAt: tweet.created_at,
    };

    // 引用ツイート
    if (tweet.quoted_tweet) {
      const qt = tweet.quoted_tweet;
      tweetData.quotedTweet = {
        id: qt.id_str,
        text: qt.text,
        user: {
          name: qt.user.name,
          screenName: qt.user.screen_name,
          profileImageUrl: qt.user.profile_image_url_https,
        },
        photos: qt.mediaDetails?.filter(m => m.media_url_https).map(m => ({
          url: m.media_url_https,
          width: m.original_info?.width || 0,
          height: m.original_info?.height || 0,
        })) || [],
      };
    }

    return NextResponse.json(tweetData);
  } catch (error) {
    console.error('Tweet fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch tweet' }, { status: 500 });
  }
}
