import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-fints uses native Node.js networking (net/tls) — webpack can't bundle it
  serverExternalPackages: ['node-fints'],
};

export default nextConfig;
