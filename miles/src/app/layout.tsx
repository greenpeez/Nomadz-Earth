import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Miles — Crypto Events Globe",
  description: "Interactive 3D globe showing crypto events worldwide",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
