import { SessionOptions } from "iron-session"

export interface SessionData {
  user?: {
    id: number
    username: string
    isAdmin: boolean
  }
  isLoggedIn: boolean
}

export const defaultSession: SessionData = {
  isLoggedIn: false
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required")
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET,
  cookieName: "kueli-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
}

// API Key認証のための型定義（将来の拡張用）
export interface ApiKeyData {
  userId: string
  keyId: string
  scopes: string[]
}
