import { supabase } from '@/lib/supabase'

// fetch() that attaches the signed-in user's access token so admin-only API
// routes (lib/admin-auth.ts requireAdmin) can verify who is calling.
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  return fetch(input, { ...init, headers })
}
