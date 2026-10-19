import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@cursor/sdk"],
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
