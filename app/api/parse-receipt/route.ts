import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getAnthropicClient } from '@/lib/anthropic'
import { createServerClient } from '@/lib/supabase'

// ── POST /api/parse-receipt
// Body: { image_id: string }   — ID from transaction_images table
// OR:   { image_url: string, image_type: 'receipt' | 'check' }
//
// Returns: { vendor, amount, date, check_number, confidence, matched_transactions }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { image_id, image_url: directUrl, image_type: directType } = body

    const supabase = createServerClient()
    let fileUrl: string
    let imageType: 'receipt' | 'check' = directType || 'receipt'
    let imageRecord: any = null

    // Load image record from DB if ID provided
    if (image_id) {
      const { data, error } = await supabase
        .from('transaction_images')
        .select('*')
        .eq('id', image_id)
        .single()
      if (error || !data) return NextResponse.json({ error: 'Image not found' }, { status: 404 })
      fileUrl = data.file_url
      imageType = data.image_type
      imageRecord = data
    } else if (directUrl) {
      fileUrl = directUrl
    } else {
      return NextResponse.json({ error: 'image_id or image_url required' }, { status: 400 })
    }

    // ── Fetch the image as base64 ──────────────────────────────
    const imgResponse = await fetch(fileUrl)
    if (!imgResponse.ok) return NextResponse.json({ error: 'Could not fetch image' }, { status: 400 })
    const imgBuffer = await imgResponse.arrayBuffer()
    const base64 = Buffer.from(imgBuffer).toString('base64')
    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg'
    const mediaType = contentType.startsWith('image/png') ? 'image/png'
      : contentType.startsWith('image/webp') ? 'image/webp'
      : contentType.startsWith('image/gif') ? 'image/gif'
      : 'image/jpeg'

    // ── Ask Claude to parse it ────────────────────────────────
    const anthropic = getAnthropicClient()

    const prompt = imageType === 'check'
      ? `You are a bookkeeping assistant. Analyze this check image and extract:
1. Payee name (who the check is written TO)
2. Amount (numeric only, no $ sign)
3. Date (in YYYY-MM-DD format)
4. Check number (if visible in top right corner)
5. Memo/note (if filled in)

Respond ONLY with valid JSON in this exact format:
{
  "vendor": "payee name here or null",
  "amount": 123.45,
  "date": "YYYY-MM-DD or null",
  "check_number": "1234 or null",
  "memo": "memo text or null",
  "confidence": "high|medium|low"
}`
      : `You are a bookkeeping assistant. Analyze this receipt image and extract:
1. Vendor/store/company name (who was paid)
2. Total amount paid (the final total, numeric only, no $ sign)
3. Date of transaction (in YYYY-MM-DD format)
4. Category suggestion (e.g. "Office Supplies", "Stock Material", "Business Operating", "Utilities", "Insurance", "Marketing/Advertising", "Subcontract Labor", "Permits", "Banking Fees", "Taxes")

Respond ONLY with valid JSON in this exact format:
{
  "vendor": "store name here or null",
  "amount": 123.45,
  "date": "YYYY-MM-DD or null",
  "category": "suggested category or null",
  "confidence": "high|medium|low"
}`

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse Claude's JSON response
    let parsed: any = {}
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Could not parse Claude response', raw: rawText }, { status: 500 })
    }

    // ── Auto-match against bank transactions ──────────────────
    let matchedTransactions: any[] = []
    if (parsed.amount && parsed.amount > 0) {
      const amt = parseFloat(parsed.amount)
      const tolerance = 0.02 // allow 2 cents rounding difference

      let query = supabase
        .from('bank_transactions')
        .select('id, transaction_date, description, amount, payee, category')
        .gte('amount', -(amt + tolerance))
        .lte('amount', -(amt - tolerance)) // expenses are negative in most bank feeds
        .is('receipt_image_id', null)       // not already matched
        .order('transaction_date', { ascending: false })
        .limit(5)

      // If we have a date, bias toward nearby transactions
      if (parsed.date) {
        const txDate = new Date(parsed.date)
        const from = new Date(txDate); from.setDate(from.getDate() - 7)
        const to = new Date(txDate); to.setDate(to.getDate() + 7)
        query = supabase
          .from('bank_transactions')
          .select('id, transaction_date, description, amount, payee, category')
          .gte('amount', -(amt + tolerance))
          .lte('amount', -(amt - tolerance))
          .gte('transaction_date', from.toISOString().split('T')[0])
          .lte('transaction_date', to.toISOString().split('T')[0])
          .is('receipt_image_id', null)
          .order('transaction_date', { ascending: false })
          .limit(5)
      }

      // Also try positive amounts (some banks show debits as positive)
      const { data: negMatches } = await query
      const { data: posMatches } = await supabase
        .from('bank_transactions')
        .select('id, transaction_date, description, amount, payee, category')
        .gte('amount', amt - tolerance)
        .lte('amount', amt + tolerance)
        .is('receipt_image_id', null)
        .order('transaction_date', { ascending: false })
        .limit(5)

      matchedTransactions = [...(negMatches || []), ...(posMatches || [])]
        .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i) // dedupe
        .slice(0, 5)
    }

    // ── If image_id provided, update the record with parsed data ──
    if (image_id && parsed.vendor) {
      const updates: any = {}
      if (parsed.vendor && !imageRecord?.vendor) updates.vendor = parsed.vendor
      if (parsed.amount && !imageRecord?.amount) updates.amount = parsed.amount
      if (parsed.date && !imageRecord?.receipt_date) updates.receipt_date = parsed.date
      if (parsed.check_number && !imageRecord?.check_number) updates.check_number = parsed.check_number
      if (Object.keys(updates).length > 0) {
        await supabase.from('transaction_images').update(updates).eq('id', image_id)
      }
    }

    return NextResponse.json({
      ...parsed,
      matched_transactions: matchedTransactions,
    })

  } catch (err: any) {
    console.error('parse-receipt error:', err)
    return NextResponse.json({ error: err.message || 'OCR failed' }, { status: 500 })
  }
}
