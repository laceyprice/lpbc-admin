'use client'
// Intentionally a no-op. We previously force-reloaded the page when a new service
// worker took over, but that interrupted active editing (e.g. wiped an in-progress
// wall chain) during frequent deploys. With skipWaiting enabled, a new version is
// already picked up on the user's next normal refresh — no forced reload needed.
export default function SwUpdater() {
  return null
}
