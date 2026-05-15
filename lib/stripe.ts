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

// Compute the processing fee to add so the merchant NETs the original amount
// after Stripe's 2.9% + $0.30 fee. Returns the fee in dollars (rounded to cents).
// Formula: chargeTotal = (amountDue + 0.30) / (1 - 0.029)  →  fee = chargeTotal - amountDue
export function calculateProcessingFee(amountDue: number): number {
  const STRIPE_PCT = 0.029
  const STRIPE_FLAT = 0.30
  const chargeTotal = (amountDue + STRIPE_FLAT) / (1 - STRIPE_PCT)
  return Math.round((chargeTotal - amountDue) * 100) / 100
}

export async function createCheckoutSession({
  invoiceId, invoiceNumber, amountDue, customerEmail, customerName, description, successUrl, cancelUrl, passProcessingFee,
}: {
  invoiceId: string; invoiceNumber?: string; amountDue: number; customerEmail: string
  customerName: string; description: string; successUrl?: string; cancelUrl?: string
  passProcessingFee?: boolean
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'

  // Default behavior: pass fee through to customer unless explicitly disabled.
  // Can also be globally disabled via env var STRIPE_PASS_PROCESSING_FEE=false
  const envPass = process.env.STRIPE_PASS_PROCESSING_FEE
  const shouldPassFee = passProcessingFee !== undefined
    ? passProcessingFee
    : envPass !== 'false'

  const lineItems: any[] = [{
    price_data: {
      currency: 'usd',
      product_data: { name: 'L. Price Building Company — Service Invoice', description },
      unit_amount: Math.round(amountDue * 100),
    },
    quantity: 1,
  }]

  if (shouldPassFee) {
    const fee = calculateProcessingFee(amountDue)
    if (fee > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Card Processing Fee',
            description: 'Covers credit card processing (2.9% + $0.30). Pay by Cash, Zelle, Venmo, or Check to avoid this fee.',
          },
          unit_amount: Math.round(fee * 100),
        },
        quantity: 1,
      })
    }
  }

  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl || `${appUrl}/invoice/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${appUrl}/invoice/cancelled`,
    customer_email: customerEmail,
    metadata: {
      invoice_id: invoiceId,
      invoice_number: invoiceNumber || '',
      customer_name: customerName,
      processing_fee_applied: shouldPassFee ? 'yes' : 'no',
    },
  })
}
