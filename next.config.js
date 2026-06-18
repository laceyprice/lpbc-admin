const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
    // New service worker takes over immediately on deploy (no waiting), so a
    // normal refresh — paired with the SwUpdater reload below — picks up the
    // latest build without users having to hard-refresh / clear cache.
    skipWaiting: true,
    clientsClaim: true,
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', 'googleapis'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'laceynprice.com' },
      { protocol: 'https', hostname: 'login.laceynprice.com' },
    ],
  },
}

module.exports = withPWA(nextConfig)
