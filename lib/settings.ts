import { createServerClient } from '@/lib/supabase'

// Small admin-editable settings, stored in the existing app_secrets table under "setting:<key>"
// (so changing them never needs a redeploy / Flux spec update). Server-side only.
export const SETTING_KEYS = ['review_url', 'default_hourly_rate', 'mileage_rate', 'missed_call_enabled', 'missed_call_text', 'forward_number'] as const
export type SettingKey = typeof SETTING_KEYS[number]

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  review_url: '',
  default_hourly_rate: '65',
  mileage_rate: '0.70',            // IRS standard business rate per mile — update each January
  missed_call_enabled: 'false',
  missed_call_text: '',            // blank = built-in message
  forward_number: '',              // your cell: calls to the business number ring here first
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const out = { ...SETTING_DEFAULTS }
  try {
    const { data } = await createServerClient().from('app_secrets').select('key,value').like('key', 'setting:%')
    for (const r of data || []) {
      const k = String(r.key).slice(8) as SettingKey
      if ((SETTING_KEYS as readonly string[]).includes(k)) out[k] = r.value
    }
  } catch { /* table missing → defaults */ }
  return out
}

export async function setSettings(values: Partial<Record<SettingKey, string>>) {
  const supabase = createServerClient()
  const rows = Object.entries(values)
    .filter(([k]) => (SETTING_KEYS as readonly string[]).includes(k))
    .map(([k, v]) => ({ key: `setting:${k}`, value: String(v ?? ''), updated_at: new Date().toISOString() }))
  if (!rows.length) return
  const { error } = await supabase.from('app_secrets').upsert(rows, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}
