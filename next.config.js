const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // Don't aggressively cache page navigations — this admin app is always online,
  // and offline-first nav caching was serving stale builds after a deploy.
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
    // skipWaiting lets a new build apply on the user's next normal refresh (no
    // hard-refresh needed). We intentionally do NOT auto-reload or clientsClaim —
    // that would hijack/reload an active editing session during a deploy.
    skipWaiting: true,
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
