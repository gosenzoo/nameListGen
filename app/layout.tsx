import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "あとがきリスト生成",
  description: "合同誌参加者のあとがきリストを PNG で生成する",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <head>
        {/* テンプレートで使う BIZ UDGothic。描画エンジンがフォント名で文字を計測するため、
            名前が変わる next/font ではなく Google Fonts の CSS をそのまま読み込む */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
