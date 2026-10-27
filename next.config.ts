import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev is bound to 0.0.0.0. Without this, Next blocks the HMR socket from
  // 127.0.0.1 and the page never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
