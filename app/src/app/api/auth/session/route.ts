import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({
        user: null,
        isLoggedIn: false
      })
    }

    return NextResponse.json({
      user: session.user,
      isLoggedIn: true
    })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
