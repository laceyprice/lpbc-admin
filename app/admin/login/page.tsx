'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Loader2, Mail, CheckCircle2 } from 'lucide-react'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  // If user arrives here with a session already (clicked magic link → Supabase
  // auto-stored session via URL hash) → bounce them into the admin.
  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data } = await supabase.auth.getSession()
      if (!cancelled && data?.session) router.push('/admin')
    }
    check()
    // Listen for SIGNED_IN events (fires when the URL hash is processed)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') router.push('/admin')
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [router])

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSent(false)
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/admin` : undefined
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    })
    if (error) {
      // Don't reveal whether the email exists — generic message
      setError(error.message.toLowerCase().includes('not found') || error.message.toLowerCase().includes('signups')
        ? 'No account found for that email. Contact your administrator.'
        : 'Could not send link — please try again.')
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1f2a2e, #b8895a)' }}>
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md mx-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 mb-4 relative"><Image src="/logo.png" alt="L. Price Building Company" fill className="object-contain" /></div>
          <h1 className="text-2xl font-extrabold text-gray-900">Admin Portal</h1>
          <p className="text-gray-500 text-sm mt-1">L. Price Building Company</p>
        </div>

        {sent ? (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ background: 'rgba(184,137,90,0.15)' }}>
              <CheckCircle2 size={32} style={{ color: '#b8895a' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Check your inbox</h2>
              <p className="text-gray-500 text-sm mt-1.5">
                We sent a one-click sign-in link to <strong className="text-gray-700">{email}</strong>.
              </p>
              <p className="text-gray-400 text-xs mt-3">
                Click the link in the email to log in. The link is valid for 1 hour.
              </p>
            </div>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="text-sm font-semibold hover:underline"
              style={{ color: '#b8895a' }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendLink} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="Lacey@LaceyNPrice.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:border-blue-400"
              />
              <p className="text-xs text-gray-400 mt-2">
                We'll email you a secure link to sign in. No password needed.
              </p>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-60"
              style={{ background: '#b8895a' }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
              {loading ? 'Sending...' : 'Send Sign-In Link'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">Private area. Unauthorized access is prohibited.</p>
      </div>
    </div>
  )
}
