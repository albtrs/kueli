import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AccessCookieName, verifyAccessToken } from './lib/jwt'

// 認証不要なパス
const PUBLIC_PATHS = [
  '/login',
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

  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  
  const token = request.cookies.get(AccessCookieName)?.value
  const user = token ? await verifyAccessToken(token) : null
  const isLoggedIn = Boolean(user)

  // ログイン済みユーザーが/loginにアクセスした場合はホームへリダイレクト
  if (isLoggedIn && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 公開パスは認証不要
  if (PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'))) {
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
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
