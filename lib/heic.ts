// iPhone photos upload as HEIC/HEIF (image/heif). Browsers CANNOT render HEIC in
// an <img>, so those photos show as broken thumbnails. sharp's prebuilt binary
// can't decode HEIC either (the HEVC codec is patent-encumbered and left out).
// `heic-convert` is a pure-JS decoder (libheif WASM) that works anywhere, so we
// transcode HEIC → JPEG at upload time and store a web-safe image instead.

// Detect HEIC/HEIF by mime, filename, or ISO-BMFF brand. AVIF is intentionally
// NOT treated as HEIC — browsers display AVIF natively.
export function isHeic(buf: Buffer, mime?: string, name?: string): boolean {
  if (mime && /image\/(heic|heif|heic-sequence|heif-sequence)/i.test(mime)) return true
  if (name && /\.(heic|heif)$/i.test(name)) return true
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12)
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'heim', 'heis', 'hevm', 'hevs', 'msf1'].includes(brand)) return true
  }
  return false
}

// Full-resolution phone photos (3–5 MB) blow through storage quotas and are far
// larger than needed for on-screen display. Downscale to a sane max edge and
// re-encode. Keeps PNGs with transparency as PNG; everything else → JPEG.
const RESIZE_MAX = 1600
const JPEG_QUALITY = 80
async function shrink(buf: Buffer, mime: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!/image\/(jpe?g|png|webp|heic|heif)/i.test(mime)) return null   // leave PDFs, SVGs, GIFs alone
  try {
    const sharp = (await import('sharp')).default
    const img = sharp(buf, { failOn: 'none' }).rotate()   // bake in EXIF orientation
    const meta = await img.metadata()
    const longest = Math.max(meta.width || 0, meta.height || 0)
    let pipeline = img
    if (longest > RESIZE_MAX) pipeline = pipeline.resize({ width: RESIZE_MAX, height: RESIZE_MAX, fit: 'inside', withoutEnlargement: true })
    const out = meta.hasAlpha
      ? { buffer: await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer(), contentType: 'image/png' }
      : { buffer: await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(), contentType: 'image/jpeg' }
    return out.buffer.length < buf.length ? out : null   // only keep it if it actually saved space
  } catch { return null }
}

const renameExt = (name: string, mime: string) => {
  if (/jpe?g/i.test(mime)) return name.replace(/\.[^.]+$/, '') + '.jpg'
  if (/png/i.test(mime)) return name.replace(/\.[^.]+$/, '') + '.png'
  return name
}

// Return a browser-displayable, storage-friendly version of an image. HEIC is
// transcoded to JPEG; large photos are downscaled/compressed. Any failure falls
// back to the prior bytes so an upload is never blocked by a bad/edge-case file.
export async function webSafeImage(
  buf: Buffer,
  mime: string,
  name: string,
): Promise<{ buffer: Buffer; contentType: string; name: string }> {
  let outBuf = buf, outMime = mime, outName = name
  try {
    if (isHeic(buf, mime, name)) {
      const convert = (await import('heic-convert')).default as any
      outBuf = Buffer.from(await convert({ buffer: buf, format: 'JPEG', quality: 0.82 }))
      outMime = 'image/jpeg'
      outName = name.replace(/\.(heic|heif)$/i, '') + '.jpg'
    }
  } catch {
    // fall through — keep the original rather than fail the whole upload
  }
  try {
    const shrunk = await shrink(outBuf, outMime)
    if (shrunk) { outBuf = shrunk.buffer; outMime = shrunk.contentType; outName = renameExt(outName, outMime) }
  } catch {}
  return { buffer: outBuf, contentType: outMime, name: outName }
}
