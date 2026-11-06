import { supabase } from '@/lib/supabase'

// fetch() that attaches the signed-in user's access token so admin-only API
// routes (lib/admin-auth.ts requireAdmin) can verify who is calling.
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  return fetch(input, { ...init, headers })
}

// The API is locked to signed-in staff (middleware.ts), but the admin pages call a bare
// fetch('/api/...') in hundreds of places. Rather than touch every call, wrap window.fetch ONCE
// (installed by AdminAuthGuard before any admin page renders) so every same-origin /api/ request
// carries the signed-in user's token. Cross-origin calls (Supabase, Google) are left alone.
let installed = false
export function installAdminFetch() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      const u = new URL(raw, window.location.origin)
      if (u.origin === window.location.origin && u.pathname.startsWith('/api/')) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
        if (!headers.has('Authorization')) {
          const { data } = await supabase.auth.getSession()
          if (data.session?.access_token) {
            headers.set('Authorization', `Bearer ${data.session.access_token}`)
            return orig(input, { ...init, headers })
          }
        }
      }
    } catch { /* fall through to a plain fetch */ }
    return orig(input, init)
  }
}
