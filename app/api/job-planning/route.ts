import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { createServerClient } from '@/lib/supabase'
import { signedUrlFor } from '@/lib/signed-url'

const BUCKET = 'job-planning'

// POST /api/job-planning            → multipart upload (one or many files)
// GET  /api/job-planning?path=...   → signed URL for one file
// DELETE /api/job-planning?path=... → remove a file

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const form = await req.formData()
  const files = form.getAll('file') as File[]
  if (!files.length) return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })

  // Group all uploads in this session under a single prefix so cleanup is easy
  const sessionId = form.get('session_id')?.toString() || `plan_${Date.now()}`

  const uploaded: { path: string; name: string; size: number; type: string; signed_url: string | null }[] = []

  for (const file of files) {
    if (!file || typeof file.size !== 'number' || file.size === 0) continue
    const safeName = file.name.replace(/[^a-z0-9._-]+/gi, '_')
    const filePath = `${sessionId}/${Date.now()}_${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage.from(BUCKET).upload(filePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) {
      return NextResponse.json({ error: `Upload failed for ${file.name}: ${error.message}` }, { status: 500 })
    }
    const url = await signedUrlFor(supabase, BUCKET, filePath, 60 * 60 * 24)
    uploaded.push({ path: filePath, name: file.name, size: file.size, type: file.type, signed_url: url })
  }

  return NextResponse.json({ session_id: sessionId, uploaded })
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const url = await signedUrlFor(supabase, BUCKET, path, 60 * 60 * 24)
  return NextResponse.json({ url })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
