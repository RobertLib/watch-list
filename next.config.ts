import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure metadata (canonical, OG tags) is always in <head>, not streamed.
  htmlLimitedBots: /.*/,
  images: {
    // `unoptimized` below means next/image serves TMDB URLs as-is and these
    // patterns are not consulted. They are kept as the allow-list that would
    // apply the moment optimisation is switched back on.
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
