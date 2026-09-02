import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { createServerClient } from '@/lib/supabase'
import { signedUrlFor } from '@/lib/signed-url'
import { webSafeImage } from '@/lib/heic'

const BUCKET = 'job-planning'
const MAX_BYTES = 12 * 1024 * 1024
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// All contents of a given meta tag (property OR name), in document order.
function metaAll(html: string, key: string): string[] {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${esc(key)}["'][^>]*>`, 'ig')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) { const c = m[0].match(/content=["']([^"']+)["']/i)?.[1]; if (c) out.push(c.trim()) }
  return out
}
// Ordered list of candidate image URLs found on a page — preview metas first,
// then in-page product images. We try each until one downloads as a real image.
function imageCandidates(html: string): string[] {
  const cands: string[] = []
  for (const k of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'twitter:image:url']) cands.push(...metaAll(html, k))
  const linkImg = html.match(/<link[^>]+rel=["']image_src["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1]
  if (linkImg) cands.push(linkImg)
  const ip = html.match(/<[^>]+itemprop=["']image["'][^>]*>/i)?.[0]
  if (ip) { const c = ip.match(/(?:content|src|href)=["']([^"']+)["']/i)?.[1]; if (c) cands.push(c) }
  let m: RegExpExecArray | null, count = 0
  const imgRe = /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/ig
  while ((m = imgRe.exec(html)) && count < 20) { cands.push(m[1]); count++ }
  return cands
}

// Normalize a raw price string ("$1,299.00", "1299") to a positive number.
function toPrice(v: any): number | null {
  if (v == null) return null
  const s = String(v).replace(/[^0-9.,]/g, '')
  if (!s) return null
  const n = Number(s.replace(/,/g, ''))
  return isFinite(n) && n > 0 ? n : null
}
// Best-effort product price from a page: preview/product metas, itemprop=price,
// then JSON-LD offer prices. Returns the first plausible amount.
function parsePrice(html: string): number | null {
  for (const k of ['product:price:amount', 'og:price:amount', 'twitter:data1', 'price']) {
    const n = toPrice(metaAll(html, k)[0]); if (n) return n
  }
  const ip = html.match(/<[^>]+itemprop=["']price["'][^>]*>/i)?.[0]
  if (ip) { const n = toPrice(ip.match(/(?:content|value)=["']([^"']+)["']/i)?.[1]); if (n) return n }
  // JSON-LD / embedded data — "price": "123.45" or "price": 123.45 (also lowPrice)
  const re = /"(?:price|lowPrice)"\s*:\s*"?([0-9][0-9.,]*)"?/ig
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) { const n = toPrice(m[1]); if (n) return n }
  return null
}

// Block obvious internal/loopback hosts (this runs server-side; basic SSRF guard).
function isBlockedHost(h: string): boolean {
  h = h.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true
  return false
}

// A page looks bot-blocked / useless when the fetch failed outright, or the body
// is a tiny challenge/error shell with no real product content (Home Depot,
// Lowe's, etc. serve a small "Error Page"/Access-Denied doc to server fetches).
function looksBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 503 || status >= 500) return true
  if (html.length < 12000 && /(error page|access denied|are you a human|captcha|enable javascript|request unsuccessful|pardon our interruption|bot detected|something went wrong)/i.test(html)) return true
  return false
}

// Rendered-browser proxy fallback (ScraperAPI). Gets past Akamai/PerimeterX and
// runs the page's JS, so we can read og:image + price from retailers that block
// plain server fetches. No-op unless SCRAPER_API_KEY is set.
async function fetchViaScraper(target: string): Promise<string | null> {
  const key = process.env.SCRAPER_API_KEY
  if (!key) return null
  const extra = process.env.SCRAPER_API_PARAMS || 'render=true&country_code=us'
  const api = `https://api.scraperapi.com/?api_key=${encodeURIComponent(key)}&url=${encodeURIComponent(target)}&${extra}`
  try {
    const r = await fetch(api, { signal: AbortSignal.timeout(58_000) })
    if (!r.ok) return null
    const t = await r.text()
    return t && t.length > 500 ? t : null
  } catch { return null }
}

// POST { url, session_id } → fetches the page, finds its preview image (og:image),
// downloads it, stores it in the job-planning bucket, returns an attachment.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  let url = String(body.url || '').trim()
  const planSession = body.session_id || `plan_${Date.now()}`
  const priceOnly = body.priceOnly === true    // skip image download/upload, just read the price
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  let pageUrl: URL
  try { pageUrl = new URL(url) } catch { return NextResponse.json({ error: 'That doesn’t look like a valid link.' }, { status: 400 }) }
  if (isBlockedHost(pageUrl.hostname)) return NextResponse.json({ error: 'That link can’t be used.' }, { status: 400 })

  const pageHeaders = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' }
  let title: string | null = null
  let price: number | null = null
  let candidates: string[] = []
  let directImage = false
  let html: string | null = null

  // 1) Direct fetch — detect a direct image, else capture the HTML.
  try {
    const res = await fetch(url, { headers: pageHeaders, redirect: 'follow' })
    const ct = res.headers.get('content-type') || ''
    if (ct.startsWith('image/')) {
      directImage = true
      candidates = [url]
      title = decodeURIComponent(pageUrl.pathname.split('/').pop() || pageUrl.hostname)
    } else {
      const t = (await res.text()).slice(0, 2_000_000)
      html = looksBlocked(res.status, t) ? null : t   // null → force the proxy fallback
    }
  } catch { /* threw — fall through to the proxy */ }

  // 2) Blocked or errored (and not a direct image) → retry via rendered proxy.
  if (!directImage && !html) {
    const via = await fetchViaScraper(url)
    if (via) html = via.slice(0, 2_000_000)
  }

  // 3) Parse whatever HTML we ended up with.
  if (!directImage) {
    if (!html) return NextResponse.json({ error: 'Could not open that link — this retailer may be blocking automatic previews.' }, { status: 502 })
    title = metaAll(html, 'og:title')[0] || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || pageUrl.hostname
    price = parsePrice(html)
    // Price-only request — return without touching storage (used on Save to
    // backfill prices for items that already have an image).
    if (priceOnly) return NextResponse.json({ price, title, sourceUrl: url })
    // resolve → absolute, dedupe, drop blocked hosts + obvious icons/sprites
    const seen = new Set<string>()
    for (let c of imageCandidates(html)) {
      c = c.replace(/&amp;/g, '&').trim()
      if (!c || c.startsWith('data:')) continue
      let abs: string
      try { abs = new URL(c, pageUrl).toString() } catch { continue }
      if (seen.has(abs)) continue; seen.add(abs)
      try { if (isBlockedHost(new URL(abs).hostname)) continue } catch { continue }
      if (/(sprite|favicon|\bicon\b|logo|pixel|1x1|blank|spacer|placeholder)/i.test(abs)) continue
      candidates.push(abs)
    }
  }
  if (priceOnly) return NextResponse.json({ price, title, sourceUrl: url })
  if (!candidates.length) return NextResponse.json({ error: 'No image was found at that link. Try a direct image link, or upload the photo.', price }, { status: 422 })

  // Try each candidate until one downloads as a real image (skip tiny placeholders).
  let buf: Buffer | null = null, mime = 'image/jpeg'
  for (const cand of candidates) {
    try {
      const r = await fetch(cand, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*', Referer: pageUrl.origin } })
      if (!r.ok) continue
      const m = (r.headers.get('content-type') || '').split(';')[0]
      const looksImage = m.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(cand)
      if (!looksImage) continue
      const b = Buffer.from(await r.arrayBuffer())
      if (b.length < 2048 && !directImage) continue   // too small — likely a pixel/placeholder
      if (b.length > MAX_BYTES) continue
      buf = b; mime = m.startsWith('image/') ? m : 'image/jpeg'
      break
    } catch { continue }
  }
  if (!buf) return NextResponse.json({ error: 'No usable image was found at that link. Try a direct image link, or upload the photo.', price }, { status: 422 })

  const supabase = createServerClient()
  const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : mime.includes('gif') ? '.gif' : '.jpg'
  const baseName = (title || 'link-image').slice(0, 80)
  const safe = await webSafeImage(buf, mime, `${baseName}${ext}`)
  const path = `${planSession}/${Date.now()}_${safe.name.replace(/[^a-z0-9._-]+/gi, '_')}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, safe.buffer, { contentType: safe.contentType, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const signed = await signedUrlFor(supabase, BUCKET, path, 60 * 60 * 24)
  return NextResponse.json({
    uploaded: { path, name: title || safe.name, type: safe.contentType, size: safe.buffer.length, signed_url: signed },
    title, price, sourceUrl: url,
  })
}
