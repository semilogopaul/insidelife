import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Monorepo root, so the standalone build traces `packages/shared`. */
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * In development the browser talks to Next on :3100 and Next proxies `/api/*` to the API (same-origin cookies) and
 * `/media/*` to the storage bucket. In Docker, nginx routes `/api`, `/socket.io` and `/media` itself; the rewrites
 * are only used for server-side fallbacks.
 */
const backend = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000';
/** Player-uploaded media (billboards, club tracks) is served same-origin at `/media` so WebGL and audio can use it. */
const mediaBucket = process.env.MEDIA_INTERNAL_URL ?? 'http://localhost:58333/insidelife-media';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@react-three/drei'],
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/media/:path*', destination: `${mediaBucket}/:path*` },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
