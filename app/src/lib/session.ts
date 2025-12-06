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

/**
 * セッションオプションを取得する関数
 * 遅延評価により、実際にセッションを使用する時点で SESSION_SECRET を検証
 * これによりビルド時は評価されず、実行時のみ環境変数が必要になる
 */
export function getSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required")
  }
  
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long")
  }

  return {
    password: secret,
    cookieName: "kueli-session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7日間
    },
  }
}
