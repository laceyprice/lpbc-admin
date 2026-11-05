// Turns a password spreadsheet (.xlsx or .csv) into vault rows. Server-side only.
//
// Expected columns (header row found automatically, any order, extra columns ignored):
//   Account | Username | Password | PassKey      (optional: URL / Website, Notes, Category)
// Section rows such as "EMAIL" or "BANKING" (a name with nothing else on the row, and bold /
// shaded / ALL CAPS in .xlsx) become the category of the entries below them.

export type ImportRow = { category: string; name: string; username: string; password: string; passkey: string; url: string; notes: string; nocreds?: boolean }
export type ParsedSheet = { name: string; rows: ImportRow[]; error?: string }

type Cell = { text: string }
type GridRow = { cells: Cell[]; bold: boolean; filled: boolean }

const NAME_KEYS = ['account', 'name', 'site', 'service', 'title', 'website name', 'login for']
const USER_KEYS = ['username', 'user name', 'user', 'login', 'email', 'user id', 'userid']
const PASS_KEYS = ['password', 'pass word', 'pw']
const PASSKEY_KEYS = ['passkey', 'pass key', 'pin', 'security answer', 'recovery', 'recovery code', 'key']
const URL_KEYS = ['url', 'website', 'site url', 'link']
const NOTE_KEYS = ['notes', 'note', 'comments']
const CAT_KEYS = ['category', 'type', 'group']

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
const isAllCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase()
const tidyCategory = (s: string) => {
  const t = s.replace(/\s+/g, ' ').replace(/[:\-–—]+$/, '').trim()
  return isAllCaps(t) ? t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : t
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function gridToRows(sheetName: string, grid: GridRow[], formatted: boolean): ParsedSheet {
  const find = (cells: Cell[], keys: string[]) => cells.findIndex(c => keys.includes(norm(c.text)))
  // header row = first row with a name-ish column AND a password column
  let h = -1
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    if (find(grid[i].cells, NAME_KEYS) >= 0 && find(grid[i].cells, PASS_KEYS) >= 0) { h = i; break }
  }
  if (h < 0) return { name: sheetName, rows: [], error: 'No header row found (needs Account and Password columns)' }
  const hc = grid[h].cells
  const col = { name: find(hc, NAME_KEYS), user: find(hc, USER_KEYS), pass: find(hc, PASS_KEYS), key: find(hc, PASSKEY_KEYS), url: find(hc, URL_KEYS), note: find(hc, NOTE_KEYS), cat: find(hc, CAT_KEYS) }
  const get = (cells: Cell[], i: number) => (i >= 0 ? (cells[i]?.text ?? '').trim() : '')

  const rows: ImportRow[] = []
  let category = 'General'
  for (let i = h + 1; i < grid.length; i++) {
    const g = grid[i], c = g.cells
    const name = get(c, col.name), username = get(c, col.user), password = get(c, col.pass), passkey = get(c, col.key)
    const url = get(c, col.url), notes = get(c, col.note), rowCat = get(c, col.cat)
    const others = [username, password, passkey, url, notes].some(Boolean)
    if (!name && !others) continue
    if (name && !others) {
      // a lone name: a section heading — or, in .xlsx, a plain row with no login info yet
      const looksLikeHeading = !formatted || g.bold || g.filled || isAllCaps(name)
      if (looksLikeHeading) { category = tidyCategory(name); continue }
      rows.push({ category, name, username: '', password: '', passkey: '', url: '', notes: '', nocreds: true })
      continue
    }
    rows.push({ category: rowCat ? tidyCategory(rowCat) : category, name: name || username || 'Untitled', username, password, passkey, url, notes })
  }
  return { name: sheetName, rows }
}

export async function parseSpreadsheet(buf: Buffer, filename: string): Promise<ParsedSheet[]> {
  if (/\.csv$/i.test(filename) || /\.txt$/i.test(filename)) {
    const text = buf.toString('utf8').replace(/^﻿/, '')
    const grid: GridRow[] = parseCsv(text).map(r => ({ cells: r.map(t => ({ text: t })), bold: false, filled: false }))
    return [gridToRows('Sheet 1', grid, false)]
  }
  if (!/\.xlsx$/i.test(filename)) throw new Error('Please upload an .xlsx or .csv file (in Google Sheets: File → Download → Microsoft Excel or CSV).')

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as any)
  const out: ParsedSheet[] = []
  wb.eachSheet(ws => {
    const grid: GridRow[] = []
    ws.eachRow({ includeEmpty: true }, row => {
      const cells: Cell[] = []
      const max = Math.max(row.cellCount, 1)
      let bold = false, filled = false
      for (let c = 1; c <= max; c++) {
        const cell = row.getCell(c)
        let text = ''
        try { text = String(cell.text ?? '') } catch { text = '' }
        cells.push({ text })
        if (text.trim()) {
          if ((cell.font as any)?.bold) bold = true
          const f: any = cell.fill
          if (f?.type === 'pattern' && f.pattern && f.pattern !== 'none') filled = true
        }
      }
      grid.push({ cells, bold, filled })
    })
    out.push(gridToRows(ws.name, grid, true))
  })
  return out
}
