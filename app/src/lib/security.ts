/**
 * セキュリティ関連のユーティリティ関数
 */

/**
 * SSRF対策: 外部URLが安全かどうかを検証
 * 内部ネットワーク、ローカルホスト、クラウドメタデータエンドポイントをブロック
 */
export function isValidExternalUrl(urlString: string): { valid: boolean; reason?: string } {
  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()
    
    // 許可されたプロトコルのみ
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, reason: 'Only HTTP and HTTPS protocols are allowed' }
    }
    
    // IPアドレスの場合の検証
    if (isPrivateIP(hostname)) {
      return { valid: false, reason: 'Private IP addresses are not allowed' }
    }
    
    // ブロックするホスト名パターン
    const blockedHostnames = [
      'localhost',
      'localhost.localdomain',
      '*.local',
      'kubernetes.default',
      'kubernetes.default.svc',
    ]
    
    for (const pattern of blockedHostnames) {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1) // ".local"
        if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
          return { valid: false, reason: 'Internal hostnames are not allowed' }
        }
      } else if (hostname === pattern) {
        return { valid: false, reason: 'Internal hostnames are not allowed' }
      }
    }
    
    return { valid: true }
  } catch {
    return { valid: false, reason: 'Invalid URL format' }
  }
}

/**
 * IPアドレスがプライベート/予約済みかどうかを判定
 */
function isPrivateIP(hostname: string): boolean {
  // IPv4の検証
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const ipv4Match = hostname.match(ipv4Regex)
  
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number)
    
    // 0.0.0.0/8 - 現在のネットワーク
    if (a === 0) return true
    
    // 10.0.0.0/8 - プライベート
    if (a === 10) return true
    
    // 100.64.0.0/10 - CGNAT
    if (a === 100 && b >= 64 && b <= 127) return true
    
    // 127.0.0.0/8 - ループバック
    if (a === 127) return true
    
    // 169.254.0.0/16 - リンクローカル (AWS/GCPメタデータエンドポイント含む)
    if (a === 169 && b === 254) return true
    
    // 172.16.0.0/12 - プライベート
    if (a === 172 && b >= 16 && b <= 31) return true
    
    // 192.0.0.0/24 - IETF Protocol Assignments
    if (a === 192 && b === 0 && c === 0) return true
    
    // 192.0.2.0/24 - TEST-NET-1
    if (a === 192 && b === 0 && c === 2) return true
    
    // 192.88.99.0/24 - 6to4 Relay Anycast
    if (a === 192 && b === 88 && c === 99) return true
    
    // 192.168.0.0/16 - プライベート
    if (a === 192 && b === 168) return true
    
    // 198.18.0.0/15 - Network benchmark tests
    if (a === 198 && (b === 18 || b === 19)) return true
    
    // 198.51.100.0/24 - TEST-NET-2
    if (a === 198 && b === 51 && c === 100) return true
    
    // 203.0.113.0/24 - TEST-NET-3
    if (a === 203 && b === 0 && c === 113) return true
    
    // 224.0.0.0/4 - マルチキャスト
    if (a >= 224 && a <= 239) return true
    
    // 240.0.0.0/4 - 将来の使用のために予約
    if (a >= 240 && a <= 255) return true
  }
  
  // IPv6の簡易検証（[]で囲まれている場合）
  const ipv6Hostname = hostname.replace(/^\[|\]$/g, '')
  if (ipv6Hostname.includes(':')) {
    const lower = ipv6Hostname.toLowerCase()
    
    // ::1 - ループバック
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true
    
    // :: - 未指定アドレス
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true
    
    // fe80::/10 - リンクローカル
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || 
        lower.startsWith('fea') || lower.startsWith('feb')) return true
    
    // fc00::/7 - ユニークローカル
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  }
  
  return false
}

/**
 * IPベースのレート制限
 */
interface RateLimitRecord {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitRecord>()

// 定期的に古いエントリをクリーンアップ
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // 1分ごと

/**
 * レート制限をチェック
 * @param identifier IPアドレスや識別子
 * @param limit ウィンドウ内の最大リクエスト数
 * @param windowMs ウィンドウの長さ（ミリ秒）
 * @returns 許可された場合はtrue、制限に達した場合はfalse
 */
export function checkRateLimit(
  identifier: string, 
  limit: number = 5, 
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const record = rateLimitStore.get(identifier)
  
  if (!record || now > record.resetTime) {
    // 新しいウィンドウを開始
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetIn: windowMs }
  }
  
  if (record.count >= limit) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetIn: record.resetTime - now 
    }
  }
  
  record.count++
  return { 
    allowed: true, 
    remaining: limit - record.count, 
    resetIn: record.resetTime - now 
  }
}

/**
 * クライアントIPを取得
 */
export function getClientIP(request: Request): string {
  // プロキシ経由の場合
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    // 最初のIPを取得（クライアントのIP）
    return forwarded.split(',')[0].trim()
  }
  
  // その他のヘッダー
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }
  
  // フォールバック
  return 'unknown'
}
