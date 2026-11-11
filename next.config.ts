import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // bcrypt and pg are native/Node-only, so they stay outside the server bundle.
  serverExternalPackages: ['bcrypt', 'pg'],
};

export default nextConfig;
