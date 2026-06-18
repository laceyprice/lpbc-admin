'use client'
import { useEffect } from 'react'

// Auto-applies a new deploy: when an updated service worker takes control,
// reload once so the user gets the latest build without a manual hard-refresh.
// Guards against the very first install (no prior controller) and reload loops.
export default function SwUpdater() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const hadController = !!navigator.serviceWorker.controller
    let reloading = false
    const onChange = () => {
      if (reloading || !hadController) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [])
  return null
}
