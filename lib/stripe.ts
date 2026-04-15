import Stripe from 'stripe'

let _stripe: Stripe | null = null
export function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })
  return _stripe
}
// Keep backward compat for any imports using `stripe` directly
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) { return (getStripe() as any)[prop] }
})

export async function createCheckoutSession({
  invoiceId, invoiceNumber, amountDue, customerEmail, customerName, description, successUrl, cancelUrl,
}: {
  invoiceId: string; invoiceNumber?: string; amountDue: number; customerEmail: string
  customerName: string; description: string; successUrl?: string; cancelUrl?: string
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'The Gasologist — Service Invoice', description },
        unit_amount: Math.round(amountDue * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: successUrl || `${appUrl}/invoice/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${appUrl}/invoice/cancelled`,
    customer_email: customerEmail,
    metadata: { invoice_id: invoiceId, invoice_number: invoiceNumber || '', customer_name: customerName },
  })
}
