import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Optional: for better Cloudflare compatibility
  /* config options here */
  // Skip static optimization for pages that use Supabase
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

export default nextConfig;