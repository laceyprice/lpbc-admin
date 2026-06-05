import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const BUCKET = 'worksite-photos'

// ── GET /api/worksites
//   ?id=uuid         → single worksite with visits + photos
//   ?search=text     → search by address
//   (none)           → all worksites with visit count + last visit
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const search = req.nextUrl.searchParams.get('search')
  const action = req.nextUrl.searchParams.get('action')

  // Photo upload signed URL
  if (action === 'upload-url') {
    const fileName = req.nextUrl.searchParams.get('file') || 'photo.jpg'
    const worksiteId = req.nextUrl.searchParams.get('worksite_id') || 'general'
    const stamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const ext = fileName.split('.').pop() || 'jpg'
    const filePath = `${worksiteId}/${stamp}_${rand}.${ext}`
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(filePath)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, filePath })
  }

  // Single worksite with full detail
  if (id) {
    // Step 1: fetch site + worksite-specific data (+ linked financial_account)
    const [siteRes, visitsRes, photosRes] = await Promise.all([
      supabase.from('worksites').select('*, financial_account:financial_accounts(id, name, color)').eq('id', id).single(),
      supabase.from('worksite_visits').select('*').eq('worksite_id', id).order('visit_date', { ascending: false }),
      supabase.from('worksite_photos').select('*').eq('worksite_id', id).order('created_at', { ascending: false }),
    ])
    if (siteRes.error) return NextResponse.json({ error: siteRes.error.message }, { status: 404 })
    const site = siteRes.data
    const addr = site.address

    // Step 2: address-based lookups across all tables in parallel
    const [invoicesRes, appointmentsRes, scheduleReqsRes] = await Promise.all([
      supabase.from('invoices')
        .select('id, invoice_number, invoice_type, invoice_status, customer_name, customer_email, customer_phone, service_type, service_date, service_description, amount_due, amount_paid, payment_type, job_address, contact_id, created_at')
        .ilike('job_address', `%${addr}%`)
        .order('service_date', { ascending: false })
        .limit(100),
      supabase.from('appointments')
        .select('id, title, customer_name, customer_email, customer_phone, service_type, service_address, notes, start_time, end_time, status, contact_id, schedule_request_id')
        .ilike('service_address', `%${addr}%`)
        .order('start_time', { ascending: false })
        .limit(100),
      supabase.from('schedule_requests')
        .select('id, first_name, last_name, phone, email, jobsite_address, service_type, preferred_date, notes, is_owner, owner_name, owner_phone, owner_email, company_name, status, created_at')
        .ilike('jobsite_address', `%${addr}%`)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const allInvoices = invoicesRes.data || []
    const appointments = appointmentsRes.data || []
    const scheduleRequests = scheduleReqsRes.data || []

    // Step 3: attach invoice objects to visits
    const invoiceMap: Record<string, any> = {}
    for (const inv of allInvoices) invoiceMap[inv.id] = inv
    const visits = (visitsRes.data || []).map((v: any) => ({
      ...v,
      invoice: v.invoice_id ? (invoiceMap[v.invoice_id] || null) : null,
    }))

    // Step 4: derive unique contacts/owners from all sources
    const peopleMap: Record<string, any> = {}
    const addPerson = (name: string | null, email: string | null, phone: string | null, source: string, date?: string | null, contactId?: string | null) => {
      if (!name || name.trim().length < 2) return
      const key = name.trim().toLowerCase()
      if (!peopleMap[key]) peopleMap[key] = { name: name.trim(), email, phone, sources: [], firstSeen: date, lastSeen: date, contact_id: contactId }
      const p = peopleMap[key]
      if (!p.sources.includes(source)) p.sources.push(source)
      if (email && !p.email) p.email = email
      if (phone && !p.phone) p.phone = phone
      if (contactId && !p.contact_id) p.contact_id = contactId
      if (date) {
        if (!p.firstSeen || date < p.firstSeen) p.firstSeen = date
        if (!p.lastSeen || date > p.lastSeen) p.lastSeen = date
      }
    }
    for (const inv of allInvoices) addPerson(inv.customer_name, inv.customer_email, inv.customer_phone, 'invoice', inv.service_date || inv.created_at?.split('T')[0], inv.contact_id)
    for (const appt of appointments) addPerson(appt.customer_name, appt.customer_email, appt.customer_phone, 'appointment', appt.start_time?.split('T')[0], appt.contact_id)
    for (const sr of scheduleRequests) {
      const name = [sr.first_name, sr.last_name].filter(Boolean).join(' ')
      addPerson(name, sr.email, sr.phone, 'schedule_request', sr.created_at?.split('T')[0])
      if (sr.owner_name && sr.owner_name !== name) addPerson(sr.owner_name, sr.owner_email, sr.owner_phone, 'schedule_request', sr.created_at?.split('T')[0])
    }
    for (const v of visits) addPerson(v.customer_name, null, v.customer_phone, 'visit', v.visit_date)
    const contacts = Object.values(peopleMap).sort((a: any, b: any) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))

    // Step 5: signed URLs for private bucket
    const photos = await Promise.all(
      (photosRes.data || []).map(async (photo: any) => {
        if (!photo.file_path) return photo
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(photo.file_path, 3600)
        return { ...photo, file_url: signed?.signedUrl || photo.file_url }
      })
    )

    return NextResponse.json({
      ...site,
      visits,
      photos,
      allInvoices,
      appointments,
      scheduleRequests,
      contacts,
    })
  }

  // List all worksites (+ linked financial_account name for sidebar/list display)
  let query = supabase.from('worksites')
    .select('*, financial_account:financial_accounts(id, name, color)')
    .order('created_at', { ascending: false })
  if (search) query = query.ilike('address', `%${search}%`)

  const { data: sites, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with visit counts + last visit
  const ids = (sites || []).map((s: any) => s.id)
  const { data: visits } = await supabase
    .from('worksite_visits')
    .select('worksite_id, visit_date, service_type')
    .in('worksite_id', ids)
    .order('visit_date', { ascending: false })

  const { data: photos } = await supabase
    .from('worksite_photos')
    .select('worksite_id')
    .in('worksite_id', ids)

  const visitMap: Record<string, any[]> = {}
  for (const v of visits || []) {
    if (!visitMap[v.worksite_id]) visitMap[v.worksite_id] = []
    visitMap[v.worksite_id].push(v)
  }
  const photoCount: Record<string, number> = {}
  for (const p of photos || []) {
    photoCount[p.worksite_id] = (photoCount[p.worksite_id] || 0) + 1
  }

  const enriched = (sites || []).map((s: any) => ({
    ...s,
    visit_count: (visitMap[s.id] || []).length,
    photo_count: photoCount[s.id] || 0,
    last_visit: visitMap[s.id]?.[0]?.visit_date || null,
    last_service: visitMap[s.id]?.[0]?.service_type || null,
  }))

  return NextResponse.json(enriched)
}

// ── POST /api/worksites
//   action=create-site          → { address, city, state, zip, property_type, notes }
//   action=create-visit         → { worksite_id, visit_date, service_type, work_performed, ... }
//   action=upload-photo         → multipart: file, worksite_id, visit_id?, caption?, photo_type?
//   action=import-from-invoices → seeds worksites + visits from all existing invoices with job_address
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action') || 'create-site'

  // ── Import worksites + visits from existing invoices ──────────────────────
  if (action === 'import-from-invoices') {
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, job_address, jobsite_city, service_type, service_date, service_description, customer_name, customer_phone, created_at')
      .not('job_address', 'is', null)
      .order('service_date', { ascending: true })
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

    // Group invoices by normalized address
    const addressMap: Record<string, any[]> = {}
    for (const inv of invoices || []) {
      const key = (inv.job_address as string).trim().toLowerCase()
      if (!addressMap[key]) addressMap[key] = []
      addressMap[key].push(inv)
    }

    let sitesCreated = 0, visitsCreated = 0, skipped = 0

    for (const invList of Object.values(addressMap)) {
      const sample = invList[0]
      const cleanAddress = (sample.job_address as string).trim()

      // Reuse existing worksite if address already exists
      const { data: existing } = await supabase
        .from('worksites')
        .select('id')
        .ilike('address', cleanAddress)
        .maybeSingle()

      let worksiteId: string | null = existing?.id || null

      if (!worksiteId) {
        const { data: site, error: siteErr } = await supabase
          .from('worksites')
          .insert({
            address: cleanAddress,
            city: sample.jobsite_city || null,
            state: 'FL',
            property_type: 'residential',
          })
          .select('id')
          .single()
        if (!siteErr && site) { worksiteId = site.id; sitesCreated++ }
      }

      if (!worksiteId) continue

      for (const inv of invList) {
        // Skip if a visit already exists for this invoice
        const { data: existingVisit } = await supabase
          .from('worksite_visits')
          .select('id')
          .eq('invoice_id', inv.id)
          .maybeSingle()
        if (existingVisit) { skipped++; continue }

        const visitDate = inv.service_date
          || (inv.created_at ? inv.created_at.split('T')[0] : new Date().toISOString().split('T')[0])

        const { error: visitErr } = await supabase.from('worksite_visits').insert({
          worksite_id: worksiteId,
          visit_date: visitDate,
          service_type: inv.service_type || null,
          work_performed: inv.service_description || null,
          customer_name: inv.customer_name || null,
          customer_phone: inv.customer_phone || null,
          invoice_id: inv.id,
          notes: `Imported from ${inv.invoice_number}`,
        })
        if (!visitErr) visitsCreated++
      }
    }

    return NextResponse.json({
      success: true,
      sitesCreated,
      visitsCreated,
      skipped,
      total: (invoices || []).length,
    })
  }

  if (action === 'upload-photo') {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const worksiteId = form.get('worksite_id') as string
    const visitId = (form.get('visit_id') as string) || null
    const caption = (form.get('caption') as string) || null
    const photoType = (form.get('photo_type') as string) || 'general'

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const stamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const filePath = `${worksiteId}/${stamp}_${rand}.${ext}`

    const buf = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buf, { contentType: file.type || undefined, upsert: false })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

    // Private bucket — generate a signed URL for immediate use; stored file_path is canonical
    const { data: signedData } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600)

    const { data, error } = await supabase.from('worksite_photos').insert({
      worksite_id: worksiteId,
      visit_id: visitId,
      file_url: signedData?.signedUrl || '',
      file_path: filePath,
      file_name: file.name,
      caption,
      photo_type: photoType,
      size_bytes: file.size,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  const body = await req.json()

  if (action === 'create-site') {
    const { address, city, state, zip, property_type, notes } = body
    if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })
    const { data, error } = await supabase.from('worksites').insert({
      address, city, state: state || 'FL', zip, property_type: property_type || 'residential', notes,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (action === 'create-visit') {
    const { worksite_id, visit_date, service_type, work_performed, technician, customer_name, customer_phone, invoice_id, appointment_id, notes } = body
    if (!worksite_id) return NextResponse.json({ error: 'worksite_id required' }, { status: 400 })
    const { data, error } = await supabase.from('worksite_visits').insert({
      worksite_id, visit_date: visit_date || new Date().toISOString().split('T')[0],
      service_type, work_performed, technician, customer_name, customer_phone,
      invoice_id: invoice_id || null, appointment_id: appointment_id || null, notes,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── Merge worksites with duplicate (normalized) addresses ───────────────
  // "171 S Driftwood Bay Unit 104" and "171 S Driftwood Bay Unit 104, Miramar Beach"
  // collapse into one canonical site. Visits, photos, and bookkeeping refs
  // re-point to the survivor; duplicates are deleted.
  if (action === 'merge-duplicates') {
    const { data: sites, error: listErr } = await supabase
      .from('worksites').select('*').order('created_at', { ascending: true })
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

    // Group by normalized key (street + unit number, no city/state)
    const groups: Record<string, any[]> = {}
    for (const s of sites || []) {
      const key = normalizeAddressForMatch(s.address)
      if (!key) continue
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }

    let merged = 0
    let groupsFound = 0
    const mergedGroups: any[] = []
    const failures: Array<{ key: string; addresses: string[]; reason: string }> = []

    for (const [key, group] of Object.entries(groups)) {
      if (group.length < 2) continue
      groupsFound++
      // Survivor: prefer one with city, then longest address, then oldest
      const survivor = group.slice().sort((a, b) => {
        const aHasCity = a.city && a.city.trim() ? 1 : 0
        const bHasCity = b.city && b.city.trim() ? 1 : 0
        if (aHasCity !== bHasCity) return bHasCity - aHasCity
        if ((b.address || '').length !== (a.address || '').length) return (b.address || '').length - (a.address || '').length
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })[0]
      const duplicates = group.filter(s => s.id !== survivor.id)
      const duplicateIds = duplicates.map(s => s.id)
      if (duplicateIds.length === 0) continue

      // 1. Re-point known child tables to survivor
      const visitsUp = await supabase.from('worksite_visits').update({ worksite_id: survivor.id }).in('worksite_id', duplicateIds)
      if (visitsUp.error) {
        failures.push({ key, addresses: duplicates.map(d => d.address), reason: `Re-point visits failed: ${visitsUp.error.message}` })
        continue
      }
      const photosUp = await supabase.from('worksite_photos').update({ worksite_id: survivor.id }).in('worksite_id', duplicateIds)
      if (photosUp.error) {
        failures.push({ key, addresses: duplicates.map(d => d.address), reason: `Re-point photos failed: ${photosUp.error.message}` })
        continue
      }

      // 2. Backfill survivor with any missing fields from duplicates
      const updates: Record<string, any> = {}
      if (!survivor.city) {
        const withCity = group.find(s => s.city && s.city.trim())
        if (withCity) updates.city = withCity.city
      }
      if (!survivor.financial_account_id) {
        const withAcct = group.find(s => s.financial_account_id)
        if (withAcct) updates.financial_account_id = withAcct.financial_account_id
      }
      // Prefer canonical address (without trailing ", Miramar Beach") if survivor's
      // address contains a comma but a duplicate's doesn't
      const survivorHasComma = (survivor.address || '').includes(',')
      const cleanerSibling = group.find(s => s.id !== survivor.id && !(s.address || '').includes(','))
      if (survivorHasComma && cleanerSibling) {
        updates.address = cleanerSibling.address
      }
      if (Object.keys(updates).length) {
        const upd = await supabase.from('worksites').update(updates).eq('id', survivor.id)
        if (upd.error) {
          failures.push({ key, addresses: duplicates.map(d => d.address), reason: `Backfill survivor failed: ${upd.error.message}` })
          continue
        }
      }

      // 3. Delete duplicates — return=representation surfaces RLS / FK issues
      const { data: deleted, error: delErr } = await supabase
        .from('worksites').delete().in('id', duplicateIds).select('id')

      if (delErr) {
        failures.push({ key, addresses: duplicates.map(d => d.address), reason: `Delete failed: ${delErr.message}` })
        continue
      }
      const deletedCount = (deleted || []).length
      if (deletedCount === 0) {
        // RLS silently blocked the delete — surface this
        failures.push({
          key,
          addresses: duplicates.map(d => d.address),
          reason: 'Delete returned 0 rows — likely blocked by RLS policy on worksites. Run the merge from SQL or grant service-role bypass.',
        })
        continue
      }

      merged += deletedCount
      mergedGroups.push({
        key,
        kept: { id: survivor.id, address: updates.address || survivor.address, city: updates.city || survivor.city },
        merged_count: deletedCount,
        merged_addresses: duplicates.map(s => s.address),
      })
    }

    return NextResponse.json({ success: true, groupsFound, merged, mergedGroups, failures })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Normalize an address for fuzzy matching: strip city/state suffixes, punctuation,
// case, common abbreviations. Keeps street + unit identifier so we can detect
// "171 S Driftwood Bay Unit 104" == "171 S Driftwood Bay Unit 104, Miramar Beach"
function normalizeAddressForMatch(addr: string | null | undefined): string {
  if (!addr) return ''
  let s = addr.toLowerCase().trim()
  // Drop everything after a comma (city/state usually)
  const comma = s.indexOf(',')
  if (comma > -1) s = s.slice(0, comma)
  s = s
    .replace(/\bapt\b\.?|\bapartment\b/g, 'unit')
    .replace(/\bste\b\.?|\bsuite\b/g, 'unit')
    .replace(/\b#\s*/g, 'unit ')
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd')
    .replace(/\broad\b/g, 'rd').replace(/\bdrive\b/g, 'dr').replace(/\blane\b/g, 'ln')
    .replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

// ── PATCH /api/worksites
//   { id, table: 'worksites'|'worksite_visits'|'worksite_photos', ...updates }
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, table, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const tableName = table === 'worksite_visits' ? 'worksite_visits'
    : table === 'worksite_photos' ? 'worksite_photos'
    : 'worksites'

  if (tableName === 'worksites') updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE /api/worksites?id=uuid&table=worksites|worksite_visits|worksite_photos
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const table = req.nextUrl.searchParams.get('table') || 'worksites'
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const tableName = table === 'worksite_visits' ? 'worksite_visits'
    : table === 'worksite_photos' ? 'worksite_photos'
    : 'worksites'

  // If deleting a photo, also remove from storage
  if (tableName === 'worksite_photos') {
    const { data: photo } = await supabase.from('worksite_photos').select('file_path').eq('id', id).single()
    if (photo?.file_path) {
      await supabase.storage.from(BUCKET).remove([photo.file_path])
    }
  }

  const { error } = await supabase.from(tableName).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
