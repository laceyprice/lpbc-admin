'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, PenLine, RotateCcw, CheckCircle2, XCircle, AlertCircle, Clock, FileText, ExternalLink } from 'lucide-react'

interface SignRequest {
  id: string
  document_name: string
  document_url: string | null
  document_text: string | null
  signer_name: string
  signer_email: string
  sender_message: string | null
  status: 'pending' | 'signed' | 'declined' | 'expired' | 'void'
  token: string
  signed_at: string | null
  expires_at: string
  created_at: string
}

function SignaturePad({ onSigned }: { onSigned: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const [hasStroke, setHasStroke] = useState(false)

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      if (!t) return null
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawing.current = true
    const pos = getPos(e)
    lastPos.current = pos
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const pos = getPos(e)
    if (!pos) return
    const from = lastPos.current || pos
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPos.current = pos
    setHasStroke(true)
  }

  function stopDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawing.current = false
    lastPos.current = null
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  function confirmSignature() {
    const canvas = canvasRef.current
    if (!canvas || !hasStroke) return
    onSigned(canvas.toDataURL('image/png'))
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl border-2 border-dashed border-gray-300 bg-white overflow-hidden cursor-crosshair select-none"
        style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full h-40"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!hasStroke && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm font-medium select-none">Sign here ↑</p>
          </div>
        )}
        <div className="absolute bottom-0 left-4 right-4 border-b-2 border-gray-200 pointer-events-none" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={clear}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <RotateCcw size={14} /> Clear
        </button>
        <button type="button" onClick={confirmSignature} disabled={!hasStroke}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-40 transition-colors"
          style={{ background: hasStroke ? '#2f5a5e' : '#9ca3af' }}>
          <PenLine size={16} />
          Use This Signature
        </button>
      </div>
    </div>
  )
}

export default function SignPage() {
  const params = useParams()
  const token = params?.token as string

  const [request, setRequest] = useState<SignRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [confirmedSig, setConfirmedSig] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [declining, setDeclining] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/signature-requests?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setRequest(d)
      })
      .catch(() => setError('Failed to load request'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSign() {
    if (!confirmedSig || !agreed || !request) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/signature-requests?action=sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signature_data: confirmedSig }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Signing failed'); return }
      setDone(true)
    } catch {
      setError('Failed to submit signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDecline() {
    if (!request || !confirm('Are you sure you want to decline this document?')) return
    setDeclining(true)
    try {
      await fetch('/api/signature-requests?action=decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setDeclined(true)
    } finally {
      setDeclining(false)
    }
  }

  const isExpired = request ? new Date(request.expires_at) < new Date() : false

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-stone-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#2f5a5e' }}>
            <PenLine size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">L. Price Building Company</p>
            <p className="text-xs text-gray-500">Electronic Signature Request</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 size={28} className="animate-spin text-gray-400" />
            <p className="text-sm text-gray-500">Loading document…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <AlertCircle size={36} className="mx-auto text-red-400 mb-3" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">Request Not Found</h2>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        )}

        {!loading && request && !error && (
          <>
            {/* Status banners */}
            {(request.status === 'signed' || done) && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                <CheckCircle2 size={36} className="mx-auto text-green-500 mb-3" />
                <h2 className="text-lg font-bold text-green-800 mb-1">Document Signed</h2>
                <p className="text-sm text-green-700">
                  {request.status === 'signed'
                    ? `This document was signed on ${new Date(request.signed_at!).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit' })}.`
                    : 'Your signature has been recorded. A confirmation email is on its way.'}
                </p>
              </div>
            )}

            {(request.status === 'declined' || declined) && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
                <XCircle size={36} className="mx-auto text-gray-400 mb-3" />
                <h2 className="text-lg font-bold text-gray-700 mb-1">Document Declined</h2>
                <p className="text-sm text-gray-500">You have declined to sign this document. L. Price Building Company has been notified.</p>
              </div>
            )}

            {(request.status === 'expired' || isExpired) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <Clock size={36} className="mx-auto text-amber-500 mb-3" />
                <h2 className="text-lg font-bold text-amber-800 mb-1">Link Expired</h2>
                <p className="text-sm text-amber-700">This signing link expired on {new Date(request.expires_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}. Please contact L. Price Building Company for a new link.</p>
              </div>
            )}

            {request.status === 'void' && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
                <XCircle size={36} className="mx-auto text-gray-400 mb-3" />
                <h2 className="text-lg font-bold text-gray-700 mb-1">Request Voided</h2>
                <p className="text-sm text-gray-500">This signature request has been voided. Please contact L. Price Building Company for more information.</p>
              </div>
            )}

            {/* Active signing form */}
            {request.status === 'pending' && !isExpired && !done && !declined && (
              <>
                {/* Document info card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3ede3' }}>
                      <FileText size={22} style={{ color: '#b8895a' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{request.document_name}</h1>
                      <p className="text-sm text-gray-500 mt-1">Requested by L. Price Building Company</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Sent {new Date(request.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                        &nbsp;·&nbsp;
                        Expires {new Date(request.expires_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                      </p>
                    </div>
                  </div>

                  {request.sender_message && (
                    <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-amber-700 mb-1 uppercase tracking-wide">Message from L. Price Building Company</p>
                      <p className="text-sm text-amber-900 whitespace-pre-wrap">{request.sender_message}</p>
                    </div>
                  )}
                </div>

                {/* Document content */}
                {(request.document_url || request.document_text) && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-700">Document to Review</p>
                      {request.document_url && (
                        <a href={request.document_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: '#b8895a' }}>
                          <ExternalLink size={12} /> Open in new tab
                        </a>
                      )}
                    </div>
                    {request.document_url ? (
                      <iframe
                        src={request.document_url}
                        className="w-full border-0"
                        style={{ height: '480px' }}
                        title={request.document_name}
                      />
                    ) : (
                      <div className="p-6 max-h-96 overflow-y-auto">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{request.document_text}</pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Signature section */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 mb-0.5">Your Signature</h2>
                    <p className="text-sm text-gray-500">Draw your signature in the box below using your mouse or finger.</p>
                  </div>

                  {!confirmedSig ? (
                    <SignaturePad onSigned={setConfirmedSig} />
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl border-2 border-green-300 bg-green-50 p-3">
                        <p className="text-xs font-semibold text-green-700 mb-2">Signature preview:</p>
                        <img src={confirmedSig} alt="Your signature" className="max-h-24 mx-auto" />
                      </div>
                      <button type="button" onClick={() => setConfirmedSig(null)}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium">
                        <RotateCcw size={13} /> Re-draw signature
                      </button>
                    </div>
                  )}

                  {/* Agreement checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex-shrink-0 mt-0.5">
                      <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                        className="sr-only" />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${agreed ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white group-hover:border-gray-400'}`}>
                        {agreed && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                    </div>
                    <span className="text-sm text-gray-700 leading-snug">
                      I, <strong>{request.signer_name}</strong>, agree that my electronic signature above represents my legal signature and consent to sign this document electronically. I have read and understand the contents of this document.
                    </span>
                  </label>

                  {/* Submit button */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={handleSign}
                      disabled={!confirmedSig || !agreed || submitting}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold disabled:opacity-40 transition-colors shadow-sm"
                      style={{ background: confirmedSig && agreed ? '#2f5a5e' : '#9ca3af' }}>
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />}
                      {submitting ? 'Signing…' : 'Sign Document'}
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                      <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Decline link */}
                  <div className="text-center pt-2 border-t border-gray-100">
                    <button onClick={handleDecline} disabled={declining}
                      className="text-xs text-gray-400 hover:text-gray-600 hover:underline transition-colors disabled:opacity-40">
                      {declining ? 'Declining…' : 'I decline to sign this document'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4">
        <p className="text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} L. Price Building Company &middot; Lacey@LaceyNPrice.com &middot; 850-598-9128
        </p>
        <p className="text-center text-xs text-gray-300 mt-1">Electronic signatures are legally binding per the ESIGN Act and UETA.</p>
      </footer>
    </div>
  )
}
