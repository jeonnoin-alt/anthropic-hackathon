import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpendSentry",
  description: "Sentri AI 지출결의서 컴플라이언스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale intentionally omitted → pinch-zoom allowed (WCAG 1.4.4)
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-sans bg-toss-bg">{children}</body>
    </html>
  );
}
