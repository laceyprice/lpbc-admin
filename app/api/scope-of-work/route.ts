import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Reuses the same Google OAuth refresh token that powers google-drive
async function getDocsClient() {
  const { google } = await import('googleapis')
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google OAuth not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN')
  }
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.docs({ version: 'v1', auth })
}

interface ScopeItem {
  category: string
  notes?: string
  estimated_cost?: number
}

interface ScopeSection {
  name: string
  items: ScopeItem[]
}

// POST /api/scope-of-work
// body: {
//   jobTitle: string            — plan title / project name
//   address?: string            — worksite address
//   city?: string               — worksite city
//   sections: ScopeSection[]    — one or more sections from the budget breakdown
// }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const { jobTitle, address, city, sections } = body

  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json({ error: 'sections array is required' }, { status: 400 })
  }

  try {
    const docs = await getDocsClient()

    const projectLine = [address, city].filter(Boolean).join(', ') || jobTitle || 'Project'
    const sectionNames = sections.map((s: ScopeSection) => s.name).join(', ')
    const docTitle = sections.length === 1
      ? `Scope of Work – ${projectLine} – ${sections[0].name}`
      : `Scope of Work – ${projectLine}`

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    // ── Build text segments ──────────────────────────────────
    // Each segment: { text, style?, bold?, italic? }
    // We insert all text at once then apply styles using the recorded positions.
    type Seg = {
      text: string
      style?: 'HEADING_1' | 'HEADING_2' | 'HEADING_3'
      bold?: boolean
      italic?: boolean
    }
    const segs: Seg[] = []

    const add = (text: string, opts: Omit<Seg, 'text'> = {}) => segs.push({ text, ...opts })

    add('SCOPE OF WORK\n', { style: 'HEADING_1' })
    if (address || city) {
      add(`${projectLine}\n`, { style: 'HEADING_2' })
    }
    add(`Date: ${today}\n`)
    add('Prepared by: L. Price Building Co.\n')
    if (sections.length > 1) {
      add(`Sections: ${sectionNames}\n`, { italic: true })
    }
    add('\n')

    for (const section of (sections as ScopeSection[])) {
      add(`${section.name}\n`, { style: 'HEADING_2' })
      add('\n')

      const items = section.items || []
      if (items.length === 0) {
        add('No line items in this section.\n', { italic: true })
      } else {
        items.forEach((item, i) => {
          add(`${i + 1}.  ${item.category}\n`, { bold: true })
          if (item.notes && item.notes.trim()) {
            add(`${item.notes.trim()}\n`)
          }
          if (item.estimated_cost != null) {
            add(`Estimated Cost: $${Number(item.estimated_cost).toFixed(2)}\n`, { bold: true })
          }
          add('\n')
        })
      }
      add('\n')
    }

    add('Authorization\n', { style: 'HEADING_2' })
    add('\n')
    add('By signing below, the client acknowledges and approves the above scope of work.\n', { italic: true })
    add('\n')
    add('Client Signature:  _________________________________  Date: _____________\n')
    add('\n')
    add('L. Price Building Co.:  ___________________________  Date: _____________\n')

    // ── Calculate character positions ────────────────────────
    let pos = 1   // Google Docs body starts at index 1
    const positioned = segs.map(seg => {
      const start = pos
      pos += seg.text.length
      return { ...seg, start, end: pos }
    })

    const fullText = segs.map(s => s.text).join('')

    // ── Create the document ──────────────────────────────────
    const created = await docs.documents.create({ requestBody: { title: docTitle } })
    const docId = created.data.documentId!

    // ── Build batchUpdate requests ───────────────────────────
    const requests: any[] = [
      // 1. Insert all content at once
      { insertText: { location: { index: 1 }, text: fullText } },
    ]

    // 2. Paragraph styles (headings) — applied per-paragraph
    for (const ps of positioned) {
      if (!ps.style) continue
      // updateParagraphStyle range must include the trailing \n
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: ps.start, endIndex: ps.end },
          paragraphStyle: { namedStyleType: ps.style },
          fields: 'namedStyleType',
        },
      })
    }

    // 3. Text styles (bold / italic) — exclude trailing \n
    for (const ps of positioned) {
      const textEnd = ps.text.endsWith('\n') ? ps.end - 1 : ps.end
      if (textEnd <= ps.start) continue   // skip empty / newline-only segments

      const textStyle: any = {}
      const fields: string[] = []
      if (ps.bold !== undefined)   { textStyle.bold   = ps.bold;   fields.push('bold')   }
      if (ps.italic !== undefined) { textStyle.italic = ps.italic; fields.push('italic') }
      if (fields.length === 0) continue

      requests.push({
        updateTextStyle: {
          range: { startIndex: ps.start, endIndex: textEnd },
          textStyle,
          fields: fields.join(','),
        },
      })
    }

    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } })

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`
    return NextResponse.json({ docUrl, docId, docTitle })
  } catch (err: any) {
    console.error('[scope-of-work] Error:', err)
    return NextResponse.json({ error: err.message || 'Failed to create Google Doc' }, { status: 500 })
  }
}
