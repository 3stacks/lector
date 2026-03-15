import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack(config) {
    // Prevent dev server from watching the data directory.
    // SQLite WAL files (afrikaans.db-shm/.db-wal) are modified on every
    // database operation and would otherwise trigger infinite HMR reloads.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/.git/**', '**/data/**'],
    };
    return config;
  },
};

export default nextConfig;
