import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Note: iOS app uses live server mode (loads from production URL)
  // Static export config preserved for future Phase 2 if needed:
  // output: "export", images: { unoptimized: true }
};

export default nextConfig;
