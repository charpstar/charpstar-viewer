import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.charpstar.net',
      },
    ],
  },
  // Increase body size limit for large GLB uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Avoid bundling Draco so we can resolve files at runtime in serverless
      const externals = Array.isArray(config.externals) ? config.externals : [];
      externals.push('draco3d', 'draco3dgltf');
      (config as any).externals = externals;
    }
    return config;
  },
};

export default nextConfig;
