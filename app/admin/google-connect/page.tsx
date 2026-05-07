'use client'
import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function GoogleConnectPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)

  async function fetchAuthUrl() {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/api/email-scan?action=auth-url')
      const data = await res.json()
      if (!res.ok || !data.authUrl) throw new Error(data.error || 'Failed to start auth flow')
      setAuthUrl(data.authUrl)
      // Auto-redirect
      window.location.href = data.authUrl
    } catch (err: any) {
      setStatus('error')
      setError(err.message)
    }
  }

  useEffect(() => {
    fetchAuthUrl()
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2" style={{ color: '#2f5a5e' }}>Reconnect Google</h1>
      <p className="text-gray-600 mb-6">
        This will re-authorize Google with all required scopes: Calendar, Gmail (read/send/modify/compose), and Drive (read-only).
      </p>

      <div className="bg-white rounded-2xl border p-6 shadow-sm">
        {status === 'loading' && (
          <div className="flex items-center gap-3 text-gray-700">
            <Loader2 size={18} className="animate-spin" />
            <span>Redirecting you to Google's consent screen…</span>
          </div>
        )}
        {status === 'error' && (
          <div>
            <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
              <AlertCircle size={18} />
              {error}
            </div>
            <button onClick={fetchAuthUrl} className="px-4 py-2 rounded-lg text-white font-semibold" style={{ background: '#b8895a' }}>
              Try again
            </button>
          </div>
        )}
        {authUrl && status !== 'error' && (
          <p className="text-sm text-gray-500 mt-4">
            If the redirect doesn't happen automatically, <a href={authUrl} className="underline font-semibold" style={{ color: '#b8895a' }}>click here to continue</a>.
          </p>
        )}
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-gray-700">
        <p className="font-bold mb-2">After authorizing:</p>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Google will redirect you to the callback page showing a new <code className="bg-white px-1 py-0.5 rounded">GOOGLE_REFRESH_TOKEN</code>.</li>
          <li>Copy that token value.</li>
          <li>Update <code className="bg-white px-1 py-0.5 rounded">GOOGLE_REFRESH_TOKEN</code> in your Flux env secret (or <code className="bg-white px-1 py-0.5 rounded">.env.local</code> for local dev).</li>
          <li>Restart the pod / redeploy. Drive imports will work after that.</li>
        </ol>
      </div>
    </div>
  )
}
