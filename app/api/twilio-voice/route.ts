import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { BUSINESS } from '@/lib/business'
import { getSettings } from '@/lib/settings'
import { textCustomer, toE164 } from '@/lib/notify'

// Missed-call text-back. PUBLIC endpoint (Twilio calls it) — every request is verified with Twilio's
// signature, so nobody else can trigger texts.
//
// Setup (Twilio console → Phone Numbers → your number → Voice → "A call comes in" → Webhook, HTTP POST):
//     {NEXT_PUBLIC_APP_URL}/api/twilio-voice
// Then in Settings → Business Settings: set "Ring my cell first" to your mobile number and turn on missed-call text-back.
//
// Flow: caller dials the business number → it rings your cell for ~20 s → if you don't pick up (no-answer / busy /
// failed) the caller gets a text right away and you get a Todo to call them back.

const xml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { 'Content-Type': 'text/xml' } })
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const params = Object.fromEntries(new URLSearchParams(raw).entries())

  // ── verify it really came from Twilio ──
  const token = process.env.TWILIO_AUTH_TOKEN
  const sig = req.headers.get('x-twilio-signature') || ''
  if (!token || !sig) return new NextResponse('Forbidden', { status: 403 })
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const url = `${base}${req.nextUrl.pathname}${req.nextUrl.search}`
  const twilio = (await import('twilio')).default
  if (!twilio.validateRequest(token, sig, url, params)) return new NextResponse('Forbidden', { status: 403 })

  const settings = await getSettings()
  const fwd = toE164(settings.forward_number)
  const step = req.nextUrl.searchParams.get('step')

  if (step !== 'after') {
    // Incoming call: ring the owner's cell first; Twilio then tells us how that went.
    if (!fwd) return xml(`<Say>Thanks for calling ${esc(BUSINESS.name)}. Please send us a text message and we will get right back to you.</Say>`)
    return xml(`<Dial timeout="20" action="${esc(`${base}/api/twilio-voice?step=after`)}" method="POST"><Number>${esc(fwd)}</Number></Dial>`)
  }

  const status = String(params.DialCallStatus || '')
  if (status === 'completed' || status === 'answered') return xml('')          // you picked up — nothing to do

  // Missed. Text the caller (once per 10 minutes per number) and leave yourself a callback todo.
  const caller = toE164(params.From || '')
  const supabase = createServerClient()
  if (caller) {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recent } = await supabase.from('message_log').select('id').eq('kind', 'missed_call').eq('to_contact', caller).gte('created_at', since).limit(1)
    if (!recent?.length) {
      if (settings.missed_call_enabled === 'true') {
        const body = settings.missed_call_text.trim() || `Hi, this is ${BUSINESS.name} — sorry we missed your call! Text us what you need (and your address) and ${BUSINESS.owner} will get back to you shortly. Or call ${BUSINESS.phone}.`
        await textCustomer(caller, body, { kind: 'missed_call' })
      }
      try {
        await supabase.from('todos').insert({ title: `Call back: missed call from ${params.From}`, priority: 'high', category: 'follow-up', source: 'missed_call', source_ref: `call:${params.CallSid}` })
      } catch { /* todo is a nice-to-have */ }
    }
  }
  return xml(`<Say>Sorry we missed you. We just sent you a text message.</Say>`)
}
