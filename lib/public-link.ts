// Customer-facing links (/api/invoice-pdf, /api/approve-quote) used to be keyed only by the
// invoice number, which is sequential (DPG INV-2026-0001) and therefore guessable. Each invoice
// now has a random `public_token` that must be in the link (&t=…).
//
// Links already sent before the token existed keep working: the migration marks every existing
// invoice `public_link_legacy = true`. If the column doesn't exist yet (migration not run) we also
// allow the link, so deploying the code first never breaks anything.
export function canViewPublic(invoice: { public_token?: string | null; public_link_legacy?: boolean | null }, t: string | null | undefined): boolean {
  if (!invoice) return false
  if (invoice.public_token === undefined || invoice.public_token === null) return true   // not migrated yet
  if (invoice.public_link_legacy) return true                                            // link emailed before tokens existed
  const given = String(t || '')
  const want = String(invoice.public_token)
  if (given.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i)   // constant-time compare
  return diff === 0
}
