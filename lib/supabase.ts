import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Browser client (anon key — RLS applies)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Service-role client (server-side only — bypasses RLS).
//
// Reusing ONE client across requests instead of `new createClient()` per
// request: supabase-js maintains its own internal connection pool to PostgREST
// and reuses keep-alive HTTP connections to upstream Postgres. Spinning up a
// fresh client on every API call defeats the pool and bursts Supabase's
// db_pool limit ("too many connections" 429s).
let _serverClient: SupabaseClient | null = null
export function createServerClient(): SupabaseClient {
  if (_serverClient) return _serverClient
  _serverClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'public' },
      global: { headers: { 'x-client-info': 'lpbc-admin-server' } },
    },
  )
  return _serverClient
}
