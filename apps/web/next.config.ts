import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, not built JavaScript (D-003).
  transpilePackages: ['@samvaad/shared'],
};

export default nextConfig;
