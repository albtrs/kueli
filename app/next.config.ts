import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  
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
};

export default nextConfig;
