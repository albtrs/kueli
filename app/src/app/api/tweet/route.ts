import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTweet } from 'react-tweet/api';

interface TweetData {
  id: string;
  text: string;
  image?: string;
  userImage?: string;
  userName?: string;
  userScreenName?: string;
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

    const tweetData: TweetData = {
      id: tweet.id_str,
      text: tweet.text,
      userName: tweet.user.name,
      userScreenName: tweet.user.screen_name,
      userImage: tweet.user.profile_image_url_https,
    };

    // ツイートに添付された画像があれば取得
    if (tweet.photos && tweet.photos.length > 0) {
      tweetData.image = tweet.photos[0].url;
    } 
    // 動画のサムネイルがあれば取得
    else if (tweet.video?.poster) {
      tweetData.image = tweet.video.poster;
    }
    // メディア詳細から取得を試みる
    else if (tweet.mediaDetails && tweet.mediaDetails.length > 0) {
      const media = tweet.mediaDetails[0];
      if (media.media_url_https) {
        tweetData.image = media.media_url_https;
      }
    }

    return NextResponse.json(tweetData);
  } catch (error) {
    console.error('Tweet fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch tweet' }, { status: 500 });
  }
}
