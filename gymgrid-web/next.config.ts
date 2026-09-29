import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate build directory is useful on synced Windows folders when an
  // abandoned process temporarily holds the default .next directory open.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
