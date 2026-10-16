import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@tre/ui', '@tre/contracts', '@tre/persistence', '@tre/flow-engine', '@tre/scene-format'], poweredByHeader: false, allowedDevOrigins: ['127.0.0.1'], devIndicators: false };
export default config;
