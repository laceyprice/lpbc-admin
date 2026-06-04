// Helper for generating short-lived signed URLs for private Supabase buckets.
//
// Architecture: buckets storing sensitive content (W-9s, COIs, bank statements,
// receipts, check images) are PRIVATE. The DB stores `file_path` (the path
// inside the bucket) and a stale `file_url` is ignored on read. Every list/get
// endpoint calls `attachSignedUrls` to replace `file_url` with a fresh
// 1-hour signed URL just for that response. Old screenshots / leaked URLs
// expire automatically.
//
// Usage:
//   const signed = await attachSignedUrls(supabase, BUCKET, rows, 'file_path', 'file_url')

export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 // 24 hours — admin-only tool, longer TTL prevents "InvalidJWT" errors after you've had the page open a while

export async function signedUrlFor(
  supabase: any,
  bucket: string,
  filePath: string | null | undefined,
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!filePath) return null
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, ttl)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

/**
 * Mutates a list of records, replacing the `urlField` with a freshly-signed
 * URL based on `pathField`. Records without `pathField` are left alone.
 */
export async function attachSignedUrls<T extends Record<string, any>>(
  supabase: any,
  bucket: string,
  rows: T[] | null | undefined,
  pathField: keyof T = 'file_path' as keyof T,
  urlField: keyof T = 'file_url' as keyof T,
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<T[]> {
  if (!rows || rows.length === 0) return []
  // Generate signed URLs in parallel — bounded since rows are usually 10-100
  await Promise.all(
    rows.map(async (row) => {
      const path = row?.[pathField] as string | undefined
      if (!path) return
      const url = await signedUrlFor(supabase, bucket, path, ttl)
      if (url) (row as any)[urlField] = url
    }),
  )
  return rows
}

/** Single-record version */
export async function attachSignedUrl<T extends Record<string, any>>(
  supabase: any,
  bucket: string,
  row: T | null | undefined,
  pathField: keyof T = 'file_path' as keyof T,
  urlField: keyof T = 'file_url' as keyof T,
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<T | null> {
  if (!row) return null
  const path = row[pathField] as string | undefined
  if (path) {
    const url = await signedUrlFor(supabase, bucket, path, ttl)
    if (url) (row as any)[urlField] = url
  }
  return row
}
