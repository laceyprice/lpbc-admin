import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase'

// Field-level encryption (AES-256-GCM) for the Account Vault, so passwords and
// notes aren't readable as plain text in the database, backups or SQL editor.
//
// Key: VAULT_ENCRYPTION_KEY (env) if set. Otherwise a random key is generated once and
// kept in the app_secrets table. Honest trade-off: with the stored key, anyone who can
// read the whole database AND the service role can decrypt; setting VAULT_ENCRYPTION_KEY
// in the server environment separates the key from the data. Decryption tries every
// available key, so adding the env key later doesn't lock old entries out.
//
// Stored format: "enc:v1:" + base64( iv[12] | authTag[16] | ciphertext ).
// Anything without that prefix is treated as legacy plain text (readable, re-encrypted on next write).

const PREFIX = 'enc:v1:'
let cached: { env: Buffer | null; stored: Buffer | null; at: number } | null = null

async function storedKey(create: boolean): Promise<Buffer | null> {
  const supabase = createServerClient()
  const read = async () => (await supabase.from('app_secrets').select('value').eq('key', 'vault_key').maybeSingle()).data?.value as string | undefined
  let v = await read()
  if (!v && create) {
    await supabase.from('app_secrets').upsert({ key: 'vault_key', value: crypto.randomBytes(32).toString('hex') }, { onConflict: 'key', ignoreDuplicates: true })
    v = await read()                                   // re-read: another request may have won the race
  }
  return v ? Buffer.from(v, 'hex') : null
}

async function keyring() {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached
  const env = process.env.VAULT_ENCRYPTION_KEY ? crypto.createHash('sha256').update(process.env.VAULT_ENCRYPTION_KEY).digest() : null
  let stored: Buffer | null = null
  try { stored = await storedKey(!env) } catch { /* app_secrets table missing */ }
  if (!env && !stored) throw new Error('Vault encryption isn\'t set up — run the app_secrets migration in Supabase (or set VAULT_ENCRYPTION_KEY).')
  cached = { env, stored, at: Date.now() }
  return cached
}

export const isEncrypted = (v: unknown) => typeof v === 'string' && v.startsWith(PREFIX)

export async function encryptField(value: string | null | undefined): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null
  if (isEncrypted(value)) return value
  const ring = await keyring()
  const key = (ring.env || ring.stored)!
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

export async function decryptField(value: string | null | undefined): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null
  if (!isEncrypted(value)) return value                // legacy plain text
  const ring = await keyring()
  const raw = Buffer.from(String(value).slice(PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28)
  for (const key of [ring.env, ring.stored]) {
    if (!key) continue
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag)
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
    } catch { /* wrong key — try the next */ }
  }
  return null                                          // can't be decrypted with any known key
}

export async function encryptFields<T extends Record<string, any>>(obj: T, fields: string[]): Promise<T> {
  const out: Record<string, any> = { ...obj }
  for (const f of fields) if (f in out) out[f] = await encryptField(out[f])
  return out as T
}

export async function decryptFields<T extends Record<string, any>>(obj: T, fields: string[]): Promise<T> {
  const out: Record<string, any> = { ...obj }
  for (const f of fields) if (f in out) out[f] = await decryptField(out[f])
  return out as T
}
