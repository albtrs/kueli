import { cookies } from "next/headers"
import { AccessCookieName, verifyAccessToken } from "./jwt"

export async function auth() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AccessCookieName)?.value
  if (!token) return null

  const user = await verifyAccessToken(token)
  if (!user) return null

  return { user }
}

export async function getSession() {
  return await auth()
}
