import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { BUSINESS } from '@/lib/business'
import { emailCustomer, simpleEmail } from '@/lib/notify'

// Daily automation endpoint — call once per day from any cron service.
//
//   Header: Authorization: Bearer <CRON_SECRET>
//
// Tasks:
//   1. Flip sent invoices to "overdue" once due_date passes
//   2. Flip permits to "expired" once expiry_date passes
//   3. Flip vendor_documents (COIs, etc.) to "expired" once expiry_date passes
//   4. Sweep bank_transactions that are categorized but missing accounting_entries
//
// Returns a summary of what changed so you can see it worked.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const summary: Record<string, number | string> = { ran_at: new Date().toISOString() }

  // 1️⃣ Overdue invoices — sent invoices past their due_date with unpaid balance
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ invoice_status: 'overdue' })
      .eq('invoice_status', 'sent')
      .lt('due_date', today)
      .select('id')
    if (error) throw error
    summary.invoices_marked_overdue = data?.length || 0
  } catch (e: any) {
    summary.invoices_error = e.message
  }

  // 2️⃣ Expired permits — anything with an expiry_date in the past that isn't already closed/expired
  try {
    const { data, error } = await supabase
      .from('permits')
      .update({ status: 'expired' })
      .lt('expiry_date', today)
      .not('expiry_date', 'is', null)
      .not('status', 'in', '(expired,closed,cancelled,not_required)')
      .select('id')
    if (error) throw error
    summary.permits_marked_expired = data?.length || 0
  } catch (e: any) {
    summary.permits_error = e.message
  }

  // 3️⃣ Expired vendor documents (COIs, W-9s with expiry, etc.)
  try {
    const { data, error } = await supabase
      .from('vendor_documents')
      .update({ status: 'expired' })
      .lt('expiry_date', today)
      .not('expiry_date', 'is', null)
      .neq('status', 'expired')
      .select('id')
    if (error) throw error
    summary.vendor_docs_marked_expired = data?.length || 0
  } catch (e: any) {
    summary.vendor_docs_error = e.message
  }

  // 4️⃣ Sync any categorized bank transactions that don't have an accounting entry yet
  try {
    const { data: postedIds } = await supabase
      .from('accounting_entries')
      .select('bank_transaction_id')
      .not('bank_transaction_id', 'is', null)
    const postedSet = new Set((postedIds || []).map((r: any) => r.bank_transaction_id))

    const { data: categorized } = await supabase
      .from('bank_transactions')
      .select('*')
      .not('account_id', 'is', null)

    let synced = 0
    for (const tx of categorized || []) {
      if (postedSet.has(tx.id)) continue
      await supabase.from('accounting_entries').insert({
        transaction_date: tx.transaction_date,
        description: tx.description,
        amount: tx.amount,
        payee: tx.payee || null,
        account_id: tx.account_id,
        check_number: tx.check_number || null,
        notes: tx.notes || null,
        source: 'auto_sync',
        bank_transaction_id: tx.id,
      })
      synced++
    }
    summary.bank_transactions_synced = synced
  } catch (e: any) {
    summary.sync_error = e.message
  }

  // 5️⃣ Service agreements coming due (next 30 days) → a Todo for you, plus an optional customer email
  try {
    const horizon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const { data: due } = await supabase.from('service_agreements').select('*').eq('is_active', true).not('next_service_date', 'is', null).lte('next_service_date', horizon)
    let todos = 0, emails = 0
    for (const a of due || []) {
      const ref = `agreement:${a.id}:${a.next_service_date}`
      const { data: existing } = await supabase.from('todos').select('id').eq('source_ref', ref).maybeSingle()
      if (!existing) {
        await supabase.from('todos').insert({ title: `Service due: ${a.customer_name}${a.service_description ? ' — ' + a.service_description : ''}`, description: [a.service_address, `Due ${a.next_service_date}`].filter(Boolean).join('\n'), priority: 'medium', category: 'scheduling', due_date: a.next_service_date, source: 'agreement', source_ref: ref })
        todos++
      }
      if (a.remind_customer && a.customer_email && a.last_reminded_for !== a.next_service_date) {
        const r = await emailCustomer(a.customer_email, `Time for your ${a.service_description || 'service'} — ${BUSINESS.name}`,
          simpleEmail('Your service is coming up', [`Hi ${String(a.customer_name).split(' ')[0]},`, `It's almost time for your ${a.service_description || 'scheduled service'}${a.service_address ? ' at ' + a.service_address : ''} (due around ${a.next_service_date}).`, `Reply to this email or call ${BUSINESS.phone} and we'll get you on the calendar.`]), { kind: 'agreement' })
        if (r.ok) { await supabase.from('service_agreements').update({ last_reminded_for: a.next_service_date }).eq('id', a.id); emails++ }
      }
    }
    summary.agreement_todos = todos; summary.agreement_emails = emails
  } catch (e: any) { summary.agreements_error = e.message }

  // 6️⃣ New website leads nobody has touched for a day → follow-up Todo
  try {
    const cutoff = new Date(Date.now() - 24 * 3600000).toISOString()
    const { data: leads } = await supabase.from('schedule_requests').select('*').eq('status', 'pending').lt('created_at', cutoff).limit(50)
    let made = 0
    for (const l of leads || []) {
      const ref = `lead:${l.id}`
      const { data: existing } = await supabase.from('todos').select('id').eq('source_ref', ref).maybeSingle()
      if (existing) continue
      await supabase.from('todos').insert({ title: `Follow up: ${[l.first_name, l.last_name].filter(Boolean).join(' ') || 'new request'}${l.service_type ? ' — ' + l.service_type : ''}`, description: [l.phone, l.email, l.jobsite_address].filter(Boolean).join(' · '), priority: 'high', category: 'follow-up', action_url: '/admin/schedule-requests', source: 'lead', source_ref: ref })
      made++
    }
    summary.lead_todos = made
  } catch (e: any) { summary.leads_error = e.message }

  return NextResponse.json({ ok: true, ...summary })
}
