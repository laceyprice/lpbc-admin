// Pure access rules for /api/* (no I/O, so they can be unit-tested). Used by middleware.ts.
//
//   public → anyone (public website forms, customer links, webhooks, crons that check their own secret)
//   user   → any signed-in user (the route itself decides what that user may see — customer portal)
//   staff  → signed-in staff only: admin / bookkeeper / invoicing(limited)
//
// DEFAULT IS STAFF. To open a new route to the public, add it below on purpose.

export type GateInput = { method: string; path: string; query: Record<string, string>; hasStripeSignature: boolean }
export type GateResult = { level: 'public' } | { level: 'user' } | { level: 'staff'; allowedRoles: string[] }

// The "invoicing" role (office help who only send invoices) must NOT reach financial / sensitive APIs.
const INVOICING_BLOCKED = [
  '/api/bookkeeping', '/api/reports', '/api/saved-reports', '/api/reconciliation', '/api/bank-accounts', '/api/bank-statements',
  '/api/plaid', '/api/expenses', '/api/chart-of-accounts', '/api/financial-accounts', '/api/transaction-images', '/api/tax-documents',
  '/api/business-tax-docs', '/api/vendor-documents', '/api/vault', '/api/vault-accounts', '/api/google-token', '/api/notepad',
  '/api/user-roles', '/api/record-files', '/api/licenses', '/api/permits', '/api/permit-jurisdictions', '/api/suppliers',
  '/api/inventory', '/api/materials-lists', '/api/property-materials', '/api/email-scan', '/api/bootstrap', '/api/parse-receipt', '/api/expirations',
  '/api/job-profit', '/api/agreements', '/api/mileage', '/api/checklists', '/api/subcontractors', '/api/settings', '/api/notify',
]

const startsWithPath = (path: string, base: string) => path === base || path.startsWith(base + '/')

export function decide(i: GateInput): GateResult {
  const { method, path, query } = i
  const m = method.toUpperCase()
  if (m === 'OPTIONS') return { level: 'public' }                                     // CORS preflight

  // ── Public ──────────────────────────────────────────────────────────────
  if (path === '/api/contact' && m === 'POST') return { level: 'public' }             // website contact form
  if (path === '/api/schedule' && m === 'POST') return { level: 'public' }           // website "request service" form
  if (path === '/api/approve-quote' && (m === 'GET' || m === 'POST')) return { level: 'public' }   // link in the quote email
  if (path === '/api/invoice-pdf' && m === 'GET') return { level: 'public' }         // link in the invoice email
  if (path === '/api/stripe' && m === 'POST' && i.hasStripeSignature) return { level: 'public' }    // Stripe webhook (route verifies the signature)
  if (path === '/api/version' && m === 'GET') return { level: 'public' }
  if ((path === '/api/daily-cron' || path === '/api/reminder-cron') && m === 'GET') return { level: 'public' }  // route requires CRON_SECRET
  if (path === '/api/google-callback' && m === 'GET') return { level: 'public' }     // Google OAuth redirect
  if (path === '/api/twilio-voice' && m === 'POST') return { level: 'public' }        // Twilio missed-call webhook (route verifies Twilio's signature)
  // LPBC e-signature links: the signer has a private token, not a login.
  if (path === '/api/signature-requests') {
    if (m === 'GET' && query.token) return { level: 'public' }
    if (m === 'POST' && (query.action === 'sign' || query.action === 'decline')) return { level: 'public' }
  }

  // ── Any signed-in user (customer portal routes verify the customer themselves) ──
  if (['/api/my-projects', '/api/project-messages', '/api/my-calendar', '/api/link-preview'].some(p => startsWithPath(path, p))) return { level: 'user' }

  // ── Staff ───────────────────────────────────────────────────────────────
  // The Todo page lists teammates (read-only) for every staff role; changing roles stays admin-only (route checks).
  if (path === '/api/user-roles' && m === 'GET') return { level: 'staff', allowedRoles: ['admin', 'bookkeeper', 'invoicing'] }
  if (INVOICING_BLOCKED.some(p => startsWithPath(path, p))) return { level: 'staff', allowedRoles: ['admin', 'bookkeeper'] }
  return { level: 'staff', allowedRoles: ['admin', 'bookkeeper', 'invoicing'] }
}
