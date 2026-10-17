import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: [
    "@tre/ui",
    "@tre/contracts",
    "@tre/persistence",
    "@tre/flow-engine",
    "@tre/scene-format",
    "@tre/backend",
    "@tre/database",
    "@tre/auth",
    "@tre/storage",
    "@tre/flow-jobs",
  ],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
};
export default config;
