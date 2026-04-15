import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = headers().get('stripe-signature')

  if (!signature) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const invoiceId = session.metadata?.invoice_id

    if (invoiceId && session.payment_status === 'paid') {
      const supabase = createServerClient()
      const { error } = await supabase
        .from('invoices')
        .update({
          invoice_status: 'paid',
          paid_at: new Date().toISOString(),
          amount_paid: (session.amount_total || 0) / 100,
          stripe_session_id: session.id,
        })
        .eq('id', invoiceId)

      if (error) {
        console.error('Failed to mark invoice paid:', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }

      console.log(`Invoice ${invoiceId} marked as paid via Stripe webhook`)
    }
  }

  return NextResponse.json({ received: true })
}
