import { NextResponse } from "next/server"
import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { SessionData, sessionOptions, defaultSession } from "@/lib/session"

export async function POST() {
  try {
    const cookieStore = await cookies()
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

    session.user = undefined
    session.isLoggedIn = false

    await session.save()

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
