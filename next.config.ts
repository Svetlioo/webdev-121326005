import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone, so the Docker image needs no node_modules install.
  output: 'standalone',
  // bcrypt and pg are native/Node-only, so they stay outside the server bundle.
  serverExternalPackages: ['bcrypt', 'pg'],
};

export default nextConfig;
