import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET /api/expirations[?days=45]
// One list of everything that is expired or expiring soon: licenses, insurance / COI / other
// documents, and permits. Feeds the "Renewals due" card on the dashboard.
// Staff only (admin / bookkeeper) — enforced by lib/api-gate.ts.

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function GET(req: NextRequest) {
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 45))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + days)
  const supabase = createServerClient()

  const [lic, docs, perms] = await Promise.all([
    supabase.from('licenses').select('id,license_type,license_number,holder_name,expiry_date,status,renewal_url')
      .not('expiry_date', 'is', null).lte('expiry_date', ymd(horizon)).not('status', 'in', '(cancelled,revoked)'),
    supabase.from('vendor_documents').select('id,doc_type,file_name,vendor_name,insurance_company,expiry_date,status')
      .not('expiry_date', 'is', null).lte('expiry_date', ymd(horizon)).neq('status', 'archived'),
    supabase.from('permits').select('id,permit_number,permit_type,job_address,expiry_date,status')
      .not('expiry_date', 'is', null).lte('expiry_date', ymd(horizon)).not('status', 'in', '(closed,passed,not_required,inquiry)'),
  ])

  const daysLeft = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - today.getTime()) / 86400000)
  const nice = (s: string | null | undefined) => String(s || '').replace(/_/g, ' ')
  const items = [
    ...(lic.data || []).map((l: any) => ({
      kind: 'License', id: l.id, expiry_date: l.expiry_date, href: '/admin/licensing', url: l.renewal_url || null,
      title: `${nice(l.license_type)} license${l.license_number ? ' #' + l.license_number : ''}`, subtitle: l.holder_name || '',
    })),
    ...(docs.data || []).map((d: any) => ({
      kind: d.doc_type === 'coi' ? 'Insurance' : 'Document', id: d.id, expiry_date: d.expiry_date, href: '/admin/documents', url: null,
      title: d.doc_type === 'coi' ? `Certificate of insurance${d.insurance_company ? ' — ' + d.insurance_company : ''}` : (d.file_name || nice(d.doc_type)),
      subtitle: d.vendor_name || '',
    })),
    ...(perms.data || []).map((p: any) => ({
      kind: 'Permit', id: p.id, expiry_date: p.expiry_date, href: '/admin/permits', url: null,
      title: `${nice(p.permit_type).toUpperCase()} permit${p.permit_number ? ' #' + p.permit_number : ''}`, subtitle: p.job_address || '',
    })),
  ]
    .map(i => ({ ...i, days_left: daysLeft(i.expiry_date) }))
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 50)

  // A table that doesn't exist yet (migration not run) just contributes nothing.
  return NextResponse.json(items)
}
