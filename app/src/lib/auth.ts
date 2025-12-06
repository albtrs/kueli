import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { SessionData, getSessionOptions, defaultSession } from "./session"

export async function auth() {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, getSessionOptions())
  
  if (!session.isLoggedIn || !session.user) {
    return null
  }

  return {
    user: session.user
  }
}

export async function getSession() {
  const cookieStore = await cookies()
  return await getIronSession<SessionData>(cookieStore, getSessionOptions())
}
