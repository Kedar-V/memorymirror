import type { NextConfig } from "next";

const pages = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

const nextConfig: NextConfig = {
  ...(pages && { output: "export", basePath: "/memorymirror", images: { unoptimized: true } }),
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@cursor/sdk"],
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
