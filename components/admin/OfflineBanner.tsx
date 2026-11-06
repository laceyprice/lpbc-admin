'use client'
import { useCallback, useEffect, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { flushQueue, onQueueChange, pendingCount } from '@/lib/offline-queue'

// Thin banner: "You're offline" and/or "N changes waiting to sync". Replays the queue when the
// connection returns, when the app opens, and every minute.
export default function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const sync = useCallback(async () => {
    if (pendingCount() === 0) return
    setSyncing(true); await flushQueue(); setSyncing(false)
  }, [])

  useEffect(() => {
    setOnline(navigator.onLine); setPending(pendingCount())
    const up = () => { setOnline(true); sync() }, down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    const off = onQueueChange(() => setPending(pendingCount()))
    sync()
    const t = setInterval(sync, 60000)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); off(); clearInterval(t) }
  }, [sync])

  if (online && pending === 0) return null
  return (
    <div className="fixed top-0 inset-x-0 z-[60] md:left-60 text-center text-xs font-semibold px-3 py-1.5 bg-amber-100 text-amber-900 flex items-center justify-center gap-2">
      {!online ? <WifiOff size={13} /> : <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
      {!online ? 'You’re offline' : 'Back online'}
      {pending > 0 && <> — {pending} change{pending === 1 ? '' : 's'} saved on this device{online ? ', syncing…' : ', will sync when you’re back online'}</>}
    </div>
  )
}
