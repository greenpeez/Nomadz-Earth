import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nomadz Earth",
  description: "Interactive 3D globe of crypto events worldwide",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-hidden">
      <body className="antialiased overflow-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
