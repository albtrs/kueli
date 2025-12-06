import { NextRequest, NextResponse } from "next/server"
import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import { SessionData, sessionOptions } from "@/lib/session"

export async function POST(request: NextRequest) {
  try {
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
