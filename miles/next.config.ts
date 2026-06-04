import type { NextConfig } from "next";

const replitDomain = process.env.REPLIT_DEV_DOMAIN || "";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    replitDomain,
    `*.${replitDomain}`,
    "*.replit.dev",
    "*.janeway.replit.dev",
  ].filter(Boolean),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
