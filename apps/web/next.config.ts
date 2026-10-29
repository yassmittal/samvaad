import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, not built JavaScript (D-003).
  transpilePackages: ['@samvaad/shared'],
  // Phones reach the dev server through a Cloudflare quick tunnel, for HTTPS (D-010).
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
