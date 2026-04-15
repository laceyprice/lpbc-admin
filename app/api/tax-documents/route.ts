import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const year = req.nextUrl.searchParams.get('year')
  let query = supabase.from('tax_documents').select('*').order('created_at', { ascending: false })
  if (year) query = query.eq('tax_year', parseInt(year))
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'upload') {
    // Handle W-9 file upload to Supabase Storage
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docId = formData.get('docId') as string

    if (!file || !docId) return NextResponse.json({ error: 'Missing file or docId' }, { status: 400 })

    const ext = file.name.split('.').pop()
    const filePath = `w9/${docId}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('tax-documents')
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: urlData } = supabase.storage.from('tax-documents').getPublicUrl(filePath)

    // Update the document record
    await supabase.from('tax_documents').update({
      file_url: urlData.publicUrl,
      file_name: file.name,
      status: 'w9_received',
    }).eq('id', docId)

    return NextResponse.json({ url: urlData.publicUrl, fileName: file.name })
  }

  if (action === 'generate1099') {
    const body = await req.json()
    const { id } = body

    const { data: doc, error } = await supabase.from('tax_documents').select('*').eq('id', id).single()
    if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    if (!doc.ein_ssn || !doc.vendor_name || !doc.amount_paid) {
      return NextResponse.json({ error: 'Missing required fields for 1099 generation (EIN/SSN, name, amount paid)' }, { status: 400 })
    }

    // Mark as generated (in a real implementation, this would generate an actual PDF)
    const { error: updateError } = await supabase
      .from('tax_documents')
      .update({ status: '1099_generated', document_type: '1099-nec' })
      .eq('id', id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({ success: true, message: '1099-NEC marked as generated. Export to your tax software.' })
  }

  // Create new vendor record
  const body = await req.json()
  const { data, error } = await supabase.from('tax_documents').insert({
    vendor_name: body.vendor_name,
    vendor_email: body.vendor_email || null,
    vendor_phone: body.vendor_phone || null,
    vendor_address: body.vendor_address || null,
    ein_ssn: body.ein_ssn || null,
    document_type: body.document_type || 'w9',
    tax_year: body.tax_year || new Date().getFullYear(),
    amount_paid: body.amount_paid || null,
    status: body.status || 'pending_w9',
    notes: body.notes || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase.from('tax_documents').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('tax_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
