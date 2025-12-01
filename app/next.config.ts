import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  
  // Turbopack設定（空でもOK、警告を消すため）
  turbopack: {},
  
  // CORS警告を解消
  devIndicators: {
    buildActivityPosition: 'bottom-right',
  },
  
  // Image最適化の設定
  images: {
    // /api/images/* は内部APIなので最適化を無効化
    unoptimized: true,
  },
};

export default nextConfig;
