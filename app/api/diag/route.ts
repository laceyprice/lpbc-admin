import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  // Lowercase the domain part of an address for diagnostic purposes
  function normalizeFrom(addr: string) {
    const at = addr.lastIndexOf('@')
    if (at < 0) return addr
    return addr.slice(0, at) + '@' + addr.slice(at + 1).toLowerCase()
  }
  const raw = process.env.RESEND_FROM_EMAIL || 'Lacey@laceynprice.com (default — not set in env)'
  const normalized = normalizeFrom(process.env.RESEND_FROM_EMAIL || 'Lacey@laceynprice.com')
  return NextResponse.json({
    version: 'v23-plan-job-photo-uploads',
    deployedAt: new Date().toISOString(),
    rawEnvValue: raw,
    normalizedValue: normalized,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || '(not set)',
    hasResendKey: !!process.env.RESEND_API_KEY,
  })
}
