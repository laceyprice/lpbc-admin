'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

// Tap the mic, say it, the words are added to the field. Uses the phone/browser's built-in
// speech recognition (free, nothing is uploaded by us). Hidden where the browser doesn't support it.
export default function VoiceButton({ onText, brand = '#b8895a' }: { onText: (text: string) => void; brand?: string }) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [err, setErr] = useState('')
  const rec = useRef<any>(null)

  useEffect(() => { setSupported(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) }, [])
  useEffect(() => () => { try { rec.current?.stop() } catch { /* ignore */ } }, [])
  if (!supported) return null

  function toggle() {
    setErr('')
    if (listening) { try { rec.current?.stop() } catch { /* ignore */ } return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const r = new SR()
    r.lang = 'en-US'; r.interimResults = false; r.continuous = false; r.maxAlternatives = 1
    r.onresult = (e: any) => { const t = Array.from(e.results).map((x: any) => x[0]?.transcript || '').join(' ').trim(); if (t) onText(t) }
    r.onerror = (e: any) => setErr(e?.error === 'not-allowed' ? 'Microphone blocked' : e?.error === 'no-speech' ? 'Didn’t hear anything' : 'Voice failed')
    r.onend = () => setListening(false)
    rec.current = r
    try { r.start(); setListening(true) } catch { setListening(false) }
  }

  return (
    <button type="button" onClick={toggle} title={listening ? 'Stop' : 'Dictate'} aria-label="Dictate"
      className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-1 border ${listening ? 'text-white border-transparent animate-pulse' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800'}`}
      style={listening ? { background: '#dc2626' } : { color: undefined }}>
      {listening ? <MicOff size={12} /> : <Mic size={12} style={{ color: brand }} />}{listening ? 'Listening…' : err || 'Speak'}
    </button>
  )
}
