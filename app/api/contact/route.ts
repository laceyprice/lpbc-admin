import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { sendContactMessage } from '@/lib/resend'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, phone, message } = body

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await sendContactMessage({ name, email, phone, message })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Contact email failed:', e)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
