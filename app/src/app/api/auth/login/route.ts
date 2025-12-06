import { NextRequest, NextResponse } from "next/server"
import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import { SessionData, sessionOptions } from "@/lib/session"
import { checkRateLimit, getClientIP } from "@/lib/security"

// ログイン試行のレート制限: 5回/分
const LOGIN_RATE_LIMIT = 5
const LOGIN_RATE_WINDOW = 60 * 1000 // 1分

export async function POST(request: NextRequest) {
  try {
    // レート制限チェック
    const clientIP = getClientIP(request)
    const rateLimit = checkRateLimit(
      `login:${clientIP}`,
      LOGIN_RATE_LIMIT,
      LOGIN_RATE_WINDOW
    )

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString(),
            'X-RateLimit-Remaining': '0',
          }
        }
      )
    }

    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { username }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    const isPasswordValid = await compare(password, user.passwordHash)

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    const cookieStore = await cookies()
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

    session.user = {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin
    }
    session.isLoggedIn = true

    await session.save()

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin
      }
    })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
