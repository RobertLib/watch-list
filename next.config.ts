import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure metadata (canonical, OG tags) is always in <head>, not streamed.
  htmlLimitedBots: /.*/,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        port: "",
        pathname: "/t/p/**",
      },
    ],
    unoptimized: true,
  },
};

export default nextConfig;
