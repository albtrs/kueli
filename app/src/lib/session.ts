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
    sameSite: "strict", // CSRF対策を強化
    maxAge: 60 * 60 * 24 * 7, // 7日間（30日から短縮）
  },
}
