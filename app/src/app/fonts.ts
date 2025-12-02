import { Noto_Sans_JP, M_PLUS_1_Code } from "next/font/google";

export const notoSansJP = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

export const mPlus1Code = M_PLUS_1_Code({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-m-plus-1-code",
});
