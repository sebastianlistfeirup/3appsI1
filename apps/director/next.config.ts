import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@tre/ui', '@tre/contracts', '@tre/persistence', '@tre/flow-engine', '@tre/scene-format'], poweredByHeader: false, devIndicators: false };
export default config;
