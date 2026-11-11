import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node 전용 CJS 패키지는 번들하지 않고 런타임에 require
  serverExternalPackages: ["web-push"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
