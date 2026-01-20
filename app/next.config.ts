import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  
  // 本番用: standaloneモードで出力（Dockerに最適化）
  output: 'standalone',
  
  // Turbopack設定（空でもOK、警告を消すため）
  turbopack: {},
  
  // devIndicators設定
  devIndicators: {
    position: 'bottom-right',
  },
  
  // Image最適化の設定
  images: {
    // /api/files/* は認証付きAPIなので最適化を無効化
    unoptimized: true,
  },

  async rewrites() {
    const apiOrigin = process.env.API_INTERNAL_ORIGIN;
    if (!apiOrigin) {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
