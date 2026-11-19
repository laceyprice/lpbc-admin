import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
import { createServerClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { BUSINESS } from '@/lib/business'
import {
  getLeadSettings, saveLeadSettings, templateHash, isTemplateApproved, importDbpr, runLeadsDaily, sendLeadEmails,
  buildEmailFor, renderLeadEmail, convertToCustomer, permitsFromRows, savePermitsAndQueue, isLeadPermit, appUrl,
  TAG_LEAD, TAG_CUSTOMER, ALL_LICENSE_TYPES, ENERGOV_SOURCES, type LeadSettings,
} from '@/lib/leads'

// Leads Generator API (staff; the invoicing role is blocked in lib/api-gate.ts).
//
//   GET  ?view=summary                    → settings, counts, queue, send log, recent permits
//   GET  ?view=contacts&tag=&q=&page=     → CRM contacts with a leads tag
//   GET  ?view=preview&id=<lead_email id> → rendered email for one queued row
//   GET  ?view=preview                    → rendered sample of the current template
//   POST ?action=import_dbpr | run_now | send | cancel | convert | upload_permits | save_settings | approve | set_auto_send

const err = (e: any, status = 500) => NextResponse.json({ error: e?.message || String(e) }, { status })

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const q = req.nextUrl.searchParams
  const view = q.get('view') || 'summary'
  try {
    if (view === 'preview') {
      const id = q.get('id')
      const s = await getLeadSettings()
      if (id) { const b = await buildEmailFor(id, s); return NextResponse.json({ to: b.row.to_email, subject: b.subject, html: b.html }) }
      const sample = renderLeadEmail(s, { first_name: 'Chris', company: 'Sample Construction LLC', address: '123 Main St', city: 'Destin', permit_type: 'Single Family Dwelling', unsubscribe_url: `${appUrl()}/api/leads-unsubscribe?t=sample` })
      return NextResponse.json({ to: '(sample contractor)', subject: sample.subject, html: sample.html })
    }

    if (view === 'contacts') {
      const tag = q.get('tag') || TAG_LEAD
      const term = (q.get('q') || '').trim()
      const page = Math.max(0, Number(q.get('page') || 0))
      let query = sb.from('contacts').select('id,first_name,last_name,email,phone,company_name,city,county,license_number,license_type,tags,email_opt_out,last_marketing_email_at,source', { count: 'exact' })
        .contains('tags', [tag]).order('company_name', { ascending: true, nullsFirst: false }).range(page * 100, page * 100 + 99)
      if (term) {
        const t = term.replace(/[%,()]/g, ' ')
        query = query.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,company_name.ilike.%${t}%,email.ilike.%${t}%,license_number.ilike.%${t}%,city.ilike.%${t}%`)
      }
      if (q.get('has_email') === '1') query = query.not('email', 'is', null)
      const { data, count, error } = await query
      if (error) throw error
      return NextResponse.json({ contacts: data || [], total: count || 0 })
    }

    // summary
    const settings = await getLeadSettings()
    const count = async (build: (x: any) => any) => { const { count } = await build(sb.from('contacts').select('id', { count: 'exact', head: true })); return count || 0 }
    const [leads, leadsWithEmail, customers, optedOut] = await Promise.all([
      count(x => x.contains('tags', [TAG_LEAD])),
      count(x => x.contains('tags', [TAG_LEAD]).not('email', 'is', null)),
      count(x => x.contains('tags', [TAG_CUSTOMER])),
      count(x => x.eq('email_opt_out', true)),
    ])
    const [{ data: queue }, { data: log }, { data: permits }] = await Promise.all([
      sb.from('lead_emails').select('id,to_email,status,created_at,contact_id,contacts(first_name,last_name,company_name),lead_permits(permit_number,address,city,county,permit_type)').eq('status', 'queued').order('created_at', { ascending: false }).limit(500),
      sb.from('lead_emails').select('id,to_email,subject,status,error,created_at,sent_at,sent_by,contacts(first_name,last_name,company_name)').neq('status', 'queued').order('created_at', { ascending: false }).limit(200),
      sb.from('lead_permits').select('id,source,county,permit_number,permit_type,work_class,status,address,city,apply_date,valuation,square_feet,contractor_company,contractor_name,contractor_email,contractor_phone,contact_id,created_at').order('apply_date', { ascending: false, nullsFirst: false }).limit(300),
    ])
    return NextResponse.json({
      settings: { ...settings, approved: isTemplateApproved(settings), current_hash: templateHash(settings) },
      counts: { leads, leadsWithEmail, customers, optedOut, queued: queue?.length || 0 },
      queue: queue || [], log: log || [], permits: permits || [],
      licenseTypes: ALL_LICENSE_TYPES, sources: ENERGOV_SOURCES.map(s => ({ key: s.key, label: s.label })),
      emailReady: !!process.env.RESEND_API_KEY, fromEmail: process.env.RESEND_FROM_EMAIL || BUSINESS.email,
    })
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (/lead_emails|lead_permits|tags|does not exist/.test(msg)) return err({ message: 'The Leads Generator database update has not been run yet. Run supabase/migrations/20261119_leads_generator.sql in the Supabase SQL editor.' }, 500)
    return err(e)
  }
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || ''
  const body = await req.json().catch(() => ({}))
  const sb = createServerClient()
  try {
    switch (action) {
      case 'import_dbpr':
        return NextResponse.json(await importDbpr({ licenseTypes: body.license_types, includeInactive: !!body.include_inactive }))

      case 'run_now':
        return NextResponse.json(await runLeadsDaily({ manual: true }))

      case 'send': {
        // Sending real marketing email — admin only, and only with an approved template (checked in sendLeadEmails).
        const denied = await requireAdmin(req); if (denied) return denied
        const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 200) : []
        if (!ids.length) return err({ message: 'Nothing selected' }, 400)
        return NextResponse.json(await sendLeadEmails(ids, 'manual'))
      }

      case 'cancel': {
        const ids: string[] = Array.isArray(body.ids) ? body.ids : []
        const { error } = await sb.from('lead_emails').update({ status: 'cancelled', error: 'removed from queue' }).in('id', ids).eq('status', 'queued')
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      case 'convert':
        if (!body.contact_id) return err({ message: 'Missing contact_id' }, 400)
        return NextResponse.json(await convertToCustomer(body.contact_id))

      case 'opt_out': {
        if (!body.contact_id) return err({ message: 'Missing contact_id' }, 400)
        const out = body.opt_out !== false
        await sb.from('contacts').update({ email_opt_out: out, email_opt_out_at: out ? new Date().toISOString() : null }).eq('id', body.contact_id)
        if (out) await sb.from('lead_emails').update({ status: 'cancelled', error: 'unsubscribed' }).eq('contact_id', body.contact_id).eq('status', 'queued')
        return NextResponse.json({ ok: true })
      }

      case 'upload_permits': {
        const county = ['Okaloosa', 'Walton', 'Santa Rosa'].includes(body.county) ? body.county : 'Santa Rosa'
        const rows: Record<string, any>[] = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : []
        const all = permitsFromRows(rows, county)
        const permits = body.all_types ? all : all.filter(p => !p.permit_type || isLeadPermit(p.permit_type, p.work_class))
        const r = await savePermitsAndQueue(permits, await getLeadSettings())
        return NextResponse.json({ rows: rows.length, recognised: all.length, kept: permits.length, ...r })
      }

      case 'save_settings': {
        const denied = await requireAdmin(req); if (denied) return denied
        const allowed: (keyof LeadSettings)[] = ['subject', 'body', 'button_label', 'button_url', 'mailing_address', 'min_days_between', 'daily_cap', 'license_types', 'sources']
        const patch: Partial<LeadSettings> = {}
        for (const k of allowed) if (k in body) (patch as any)[k] = body[k]
        if ('min_days_between' in patch) patch.min_days_between = Math.max(7, Math.min(365, Number(patch.min_days_between) || 30))
        if ('daily_cap' in patch) patch.daily_cap = Math.max(0, Math.min(200, Number(patch.daily_cap) || 0))
        const s = await saveLeadSettings(patch)
        return NextResponse.json({ ...s, approved: isTemplateApproved(s) })
      }

      case 'approve': {
        const denied = await requireAdmin(req); if (denied) return denied
        const s = await getLeadSettings()
        if (!s.mailing_address.trim()) return err({ message: 'Add your business mailing address first — the law (CAN-SPAM) requires it in every marketing email.' }, 400)
        const next = await saveLeadSettings({ approved_hash: body.approve === false ? null : templateHash(s), approved_at: body.approve === false ? null : new Date().toISOString() })
        return NextResponse.json({ ...next, approved: isTemplateApproved(next) })
      }

      case 'set_auto_send': {
        const denied = await requireAdmin(req); if (denied) return denied
        const s = await getLeadSettings()
        if (body.on && !isTemplateApproved(s)) return err({ message: 'Approve the email template before turning on automatic sending.' }, 400)
        const next = await saveLeadSettings({ auto_send: !!body.on })
        return NextResponse.json({ ...next, approved: isTemplateApproved(next) })
      }

      default:
        return err({ message: 'Unknown action' }, 400)
    }
  } catch (e: any) { return err(e) }
}
