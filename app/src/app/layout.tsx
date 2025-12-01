import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notoSansJP } from "./fonts";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "メモアプリ",
  description: "Next.js + Prisma + NextAuthを使用したMarkdownメモアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansJP.variable} antialiased text-base`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
