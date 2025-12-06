import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, getSessionOptions } from './lib/session'

// 認証不要なパス
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
]

// 静的ファイルやNext.js内部のパス
const IGNORED_PATHS = [
  '/_next',
  '/favicon.ico',
  '/robots.txt',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // 静的ファイルは無視
  if (IGNORED_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }
  
  // セッションを確認
  const response = NextResponse.next()
  
  try {
    const session = await getIronSession<SessionData>(request, response, getSessionOptions())
    const isLoggedIn = session.isLoggedIn && session.user
    
    // ログイン済みユーザーが/loginにアクセスした場合はホームへリダイレクト
    if (isLoggedIn && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    
    // 公開パスは認証不要
    if (PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'))) {
      return response
    }
    
    if (!isLoggedIn) {
      // 未認証の場合
      
      // APIリクエストの場合は401を返す
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
      
      // ページリクエストの場合はログインページにリダイレクト
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
    
    return response
  } catch (error) {
    console.error('Middleware error:', error)
    
    // エラー時はログインページにリダイレクト
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: [
    /*
     * 以下を除くすべてのパスにマッチ:
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化)
     * - favicon.ico (ファビコン)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
