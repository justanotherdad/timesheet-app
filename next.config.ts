import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Cloudflare Pages handles output automatically - no standalone needed
  
  // Add timeout configurations for Cloudflare Pages
  experimental: {
    // Increase timeout for server-side operations
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Optimize for Cloudflare Pages
  reactStrictMode: true,
  
  // Add headers to help with timeout issues
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;