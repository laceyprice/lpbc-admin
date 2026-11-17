import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase'

// The Google refresh token used by Gmail, Calendar, Drive and Photos. Prefers the value saved
// in Supabase (set automatically when you reconnect from Settings → Google Connection, no
// redeploy needed) and falls back to the GOOGLE_REFRESH_TOKEN environment variable.
let cache: { value: string | null; at: number } | null = null

export async function getGoogleRefreshToken(): Promise<string | undefined> {
  if (!cache || Date.now() - cache.at > 60_000) {
    let value: string | null = null
    try {
      const { data } = await createServerClient().from('app_secrets').select('value').eq('key', 'google_refresh_token').maybeSingle()
      value = data?.value || null
    } catch { /* table not created yet — use the env var */ }
    cache = { value, at: Date.now() }
  }
  return cache.value || process.env.GOOGLE_REFRESH_TOKEN || undefined
}

export function clearGoogleTokenCache() { cache = null }

export async function saveGoogleRefreshToken(value: string): Promise<string | null> {
  const { error } = await createServerClient().from('app_secrets')
    .upsert({ key: 'google_refresh_token', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  clearGoogleTokenCache()
  return error ? error.message : null
}

// One-time "state" value for the Google consent screen. It's created only when a signed-in admin
// presses Reconnect, so the public callback can save the returned token automatically without
// letting anyone else's Google sign-in overwrite it. Stored in the DB so any Flux node can check it.
const STATE_KEY = 'google_oauth_state'
const STATE_TTL_MS = 30 * 60_000

export async function createGoogleOAuthState(): Promise<string> {
  const nonce = crypto.randomBytes(24).toString('hex')
  await createServerClient().from('app_secrets')
    .upsert({ key: STATE_KEY, value: JSON.stringify({ nonce, at: Date.now() }), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return nonce
}

export async function consumeGoogleOAuthState(state: string | null): Promise<boolean> {
  if (!state) return false
  try {
    const supabase = createServerClient()
    const { data } = await supabase.from('app_secrets').select('value').eq('key', STATE_KEY).maybeSingle()
    if (!data?.value) return false
    const { nonce, at } = JSON.parse(data.value)
    const ok = typeof nonce === 'string' && nonce.length === state.length
      && crypto.timingSafeEqual(Buffer.from(nonce), Buffer.from(state)) && Date.now() - at < STATE_TTL_MS
    if (ok) await supabase.from('app_secrets').delete().eq('key', STATE_KEY)   // single use
    return ok
  } catch { return false }
}
