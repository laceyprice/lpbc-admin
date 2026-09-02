'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

export interface PageBox { index: number; width: number; height: number }

// Renders a document — a PDF (from a File or URL) or plain text — into one or
// more pages, each with an absolutely-positioned overlay slot for placing /
// showing signature fields. Fraction coordinates (0..1 of a page box) map
// identically here whether the field is being placed (admin) or signed (signer).
export default function DocPages({
  file, url, text, maxWidth = 720, overlay,
}: {
  file?: File | null
  url?: string | null
  text?: string | null
  maxWidth?: number
  overlay?: (page: PageBox) => React.ReactNode
}) {
  const isPdf = !!file || !!url
  const [pages, setPages] = useState<PageBox[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({})
  const pendingRef = useRef<Array<{ i: number; page: any; scale: number; w: number; h: number }>>([])

  // ── PDF: load + measure pages ──────────────────────────────────────────────
  useEffect(() => {
    if (!isPdf) return
    let cancelled = false
    setLoading(true); setError(''); setPages([])
    ;(async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
        const src = file ? { data: await file.arrayBuffer() } : { url: url! }
        const pdf = await pdfjs.getDocument(src).promise
        if (cancelled) return
        const width = Math.min(maxWidth, containerRef.current?.clientWidth || maxWidth)
        const boxes: PageBox[] = []
        const tasks: Array<{ i: number; page: any; scale: number; w: number; h: number }> = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const vp1 = page.getViewport({ scale: 1 })
          const scale = width / vp1.width
          const vp = page.getViewport({ scale })
          boxes.push({ index: i - 1, width: Math.round(vp.width), height: Math.round(vp.height) })
          tasks.push({ i: i - 1, page, scale, w: Math.round(vp.width), h: Math.round(vp.height) })
        }
        if (cancelled) return
        pendingRef.current = tasks
        setPages(boxes)
        setLoading(false)
      } catch {
        if (!cancelled) { setError('Could not render this document.'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [file, url, maxWidth, isPdf])

  // ── PDF: paint canvases once their wrappers exist ──────────────────────────
  useEffect(() => {
    const tasks = pendingRef.current
    if (!tasks.length) return
    ;(async () => {
      for (const t of tasks) {
        const canvas = canvasRefs.current[t.i]
        if (!canvas) continue
        const dpr = window.devicePixelRatio || 1
        canvas.width = t.w * dpr; canvas.height = t.h * dpr
        canvas.style.width = `${t.w}px`; canvas.style.height = `${t.h}px`
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        try { await t.page.render({ canvasContext: ctx, viewport: t.page.getViewport({ scale: t.scale }) }).promise } catch {}
      }
      pendingRef.current = []
    })()
  }, [pages])

  // ── Text: measure the rendered box so overlay fractions map ────────────────
  useEffect(() => {
    if (isPdf || text == null) return
    const measure = () => { const el = textRef.current; if (el) setPages([{ index: 0, width: el.clientWidth, height: el.clientHeight }]) }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro && textRef.current) ro.observe(textRef.current)
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [text, isPdf])

  return (
    <div ref={containerRef} className="w-full">
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      {loading && <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-gray-400" /></div>}

      {!isPdf ? (
        <div className="relative mx-auto bg-white border border-gray-200 rounded-lg shadow-sm" style={{ maxWidth }}>
          <div ref={textRef} className="p-8 whitespace-pre-wrap text-sm text-gray-800 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
            {text || 'No document content.'}
          </div>
          {pages[0] && overlay && <div className="absolute inset-0">{overlay(pages[0])}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          {pages.map(pb => (
            <div key={pb.index} className="relative mx-auto bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden" style={{ width: pb.width, height: pb.height }}>
              <canvas ref={el => { canvasRefs.current[pb.index] = el }} />
              {overlay && <div className="absolute inset-0">{overlay(pb)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
