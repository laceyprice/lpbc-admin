'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Loader2, Lock, Eye, EyeOff } from 'lucide-react'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Invalid email or password.'); setLoading(false) }
    else router.push('/admin')
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1a4a6b, #185FA5)' }}>
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md mx-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 mb-4 relative"><Image src="/logo.png" alt="The Gasologist" fill className="object-contain" /></div>
          <h1 className="text-2xl font-extrabold text-gray-900">Admin Portal</h1>
          <p className="text-gray-500 text-sm mt-1">The Gasologist</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="office@thegasologist.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:border-blue-400" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-60"
            style={{ background: '#185FA5' }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-6">Private area. Unauthorized access is prohibited.</p>
      </div>
    </div>
  )
}
