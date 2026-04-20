/**
 * One-time invoice import for L Price Building Company
 * Run with: node scripts/import-invoices.mjs
 *
 * Reads credentials from .env.local — run from the admin/ directory.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// ── Load .env.local ──────────────────────────────────────────
const envText = readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envText.split('\n')
    .map(l => l.match(/^([^#=\s][^=]*)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k.trim(), v.trim()])
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Contact data ─────────────────────────────────────────────
const contacts = [
  {
    first_name: 'Wendell & Carol',
    last_name: 'Causey',
    email: 'cwcausey12@gmail.com',
    phone: '770-335-9774',
    notes: 'Also: wcausey@crimsoncpa.com | 111 S Driftwood Bay Unit 119',
  },
  {
    first_name: 'Lisa',
    last_name: 'Givens',
    email: 'lltg64@icloud.com',
    phone: '615-405-4094',
    notes: 'Also: lltg64@hotmail.com | 152 S Driftwood Bay Unit 151, Miramar Beach',
  },
  {
    first_name: 'Shelly',
    last_name: 'Chezek',
    email: 'shellymarie2@yahoo.com',
    phone: '850-460-4126',
    notes: '518 NW Parkview Rd Unit A, Fort Walton Beach',
  },
  {
    first_name: 'Melanie',
    last_name: 'Hawks',
    email: 'mhawks@gmail.com',
    phone: '270-309-0402',
    notes: 'Also: mhawks@hotmail.com | 171 S Driftwood Bay Unit 104, Miramar Beach',
  },
]

// ── Invoice data ─────────────────────────────────────────────
// Fields: invoice_number, contact_key (email to look up), customer_name,
//         customer_email, customer_phone, job_address, service_type,
//         service_date, invoice_status, amount_due, amount_paid,
//         payment_type, service_description, notes
const invoices = [
  {
    invoice_number: 'INV-1104',
    contact_email: 'lltg64@icloud.com',
    customer_name: 'Lisa Givens',
    customer_email: 'lltg64@icloud.com',
    customer_phone: '615-405-4094',
    job_address: '152 S Driftwood Bay Unit 151, Miramar Beach',
    service_type: 'DRAW',
    service_date: '2026-01-05',
    invoice_status: 'paid',
    amount_due: 1500.00,
    amount_paid: 1500.00,
    payment_type: 'bank_draft',
    service_description: '50% Draw of $750 management fee: $325\nDemo Prep: $150\nDemo: $750\nDisposal: $200\nFraming for shower curb, niche and studs for shower door: $75',
  },
  {
    invoice_number: 'INV-1105',
    contact_email: 'shellymarie2@yahoo.com',
    customer_name: 'Shelly Chezek',
    customer_email: 'shellymarie2@yahoo.com',
    customer_phone: '850-460-4126',
    job_address: '518 NW Parkview Rd Unit A, Fort Walton Beach',
    service_type: 'SERVICE',
    service_date: '2026-01-06',
    invoice_status: 'paid',
    amount_due: 1350.00,
    amount_paid: 1350.00,
    payment_type: null,
    service_description: 'Install 2 60" vanities and tops: $500\nInstall 2 mirrors and trimout: $250\nPaint 2 bathrooms: $600',
  },
  {
    invoice_number: 'INV-1106',
    contact_email: 'mhawks@gmail.com',
    customer_name: 'Melanie Hawks',
    customer_email: 'mhawks@gmail.com',
    customer_phone: '270-309-0402',
    job_address: '171 S Driftwood Bay Unit 104, Miramar Beach',
    service_type: 'DRAW',
    service_date: '2026-01-09',
    invoice_status: 'paid',
    amount_due: 8500.00,
    amount_paid: 8500.00,
    payment_type: null,
    service_description: '25% Mobilization Draw of $6,000: $1,500\nDemo Prep — moved all contents/furniture upstairs: $750\nKitchen Demo — removed cabinets, bulkhead and wall at end of bar; opened walls and ceiling for rough in: $2,500\nDemo Tile Floor — removed all tile downstairs and prepared floor for layer to buff: $3,500\nFraming — cut down bar wall to bar height, frame in wall for plumber to reroute drain line, sure up dropdown in hallway: $250',
  },
  {
    invoice_number: 'INV-1107',
    contact_email: 'lltg64@icloud.com',
    customer_name: 'Lisa Givens',
    customer_email: 'lltg64@icloud.com',
    customer_phone: '615-405-4094',
    job_address: '152 S Driftwood Bay Unit 151, Miramar Beach',
    service_type: 'SERVICE',
    service_date: '2026-01-09',
    invoice_status: 'paid',
    amount_due: 1000.00,
    amount_paid: 1000.00,
    payment_type: null,
    service_description: 'Electrical Rough and Trim: Located and troubleshooted 4 buried junctions (three in wall, 1 in ceiling). Ran new wire to new can over shower. Ran new wire to bath fan, installed new bath fan. Installed new snap-in box and ran new wire to vanity light. Rerouted one buried junction to outlet in bathroom and placed remaining required junctions in bathroom 3-gang switch box. Installed 2-gang outlet box for two plugs (one GFCI).\n\nTotal: $1,350 — $1,000 collected now; $350 due on trim-out (see INV-1109).',
  },
  {
    invoice_number: 'INV-1108',
    contact_email: 'shellymarie2@yahoo.com',
    customer_name: 'Shelly Chezek',
    customer_email: 'shellymarie2@yahoo.com',
    customer_phone: '850-460-4126',
    job_address: '518 NW Parkview Rd Unit A, Fort Walton Beach',
    service_type: 'SERVICE',
    service_date: '2026-02-13',
    invoice_status: 'sent',
    amount_due: 950.00,
    amount_paid: 0,
    payment_type: null,
    service_description: 'JOB CLOSING — Final 50% Draw: $1,250 minus $300 for tile credit.\n(If tile costs more than $300, please deduct remaining balance.)',
  },
  {
    invoice_number: 'INV-1109',
    contact_email: 'lltg64@icloud.com',
    customer_name: 'Lisa Givens',
    customer_email: 'lltg64@icloud.com',
    customer_phone: '615-405-4094',
    job_address: '152 S Driftwood Bay Unit 151, Miramar Beach',
    service_type: 'SERVICE',
    service_date: '2026-02-13',
    invoice_status: 'sent',
    amount_due: 1150.00,
    amount_paid: 0,
    payment_type: null,
    service_description: 'Trimmed Out Electrical: Installed vanity light, wafer light, three switches and two outlets: $350\nRetro-fit bathroom door to close properly: $125\nInstalled bathroom mirror: $50\nConstruction clean: $300\nJOB CLOSING — Final 50% Draw (balance from INV-1107): $325',
  },
  {
    invoice_number: 'INV-1110',
    contact_email: 'cwcausey12@gmail.com',
    customer_name: 'Wendell & Carol Causey',
    customer_email: 'cwcausey12@gmail.com',
    customer_phone: '770-335-9774',
    job_address: '111 S Driftwood Bay Unit 119, Miramar Beach',
    service_type: 'DRAW',
    service_date: '2026-02-13',
    invoice_status: 'sent',
    amount_due: 4665.00,
    amount_paid: 0,
    payment_type: null,
    service_description: 'DRAW 3 — 50% Completion Draw: $4,665.00',
  },
  {
    invoice_number: 'INV-1112',
    contact_email: 'lltg64@icloud.com',
    customer_name: 'Lisa Givens',
    customer_email: 'lltg64@hotmail.com',
    customer_phone: '615-405-4094',
    job_address: '151 S Driftwood Bay Unit 152, Miramar Beach',
    service_type: 'SERVICE',
    service_date: '2026-03-13',
    invoice_status: 'sent',
    amount_due: 149.00,
    amount_paid: 0,
    payment_type: null,
    service_description: 'Project Management: Electrical service call. See forwarded invoice paid by L Price Building Company.',
    notes: 'Receipt on file: https://drive.google.com/file/d/1Uu2Ru96ss61p2gji_0HSrp8BJWYWC9hkum38jpItYH4qSGLm-jmdtuG11StnUZZbDfX9OIAD71qPlm4w6FOb0QtWSeOAGZmghQPaXhl5Soy_cBDZhBaROe3gZcFuM1ft58EKtY4pJVdAtYFw8GskACSjemIv-EaCgYKAdISARISFQHGX2Mi4HZcFgG0YstvxBI8yUJKUA0206',
  },
  {
    invoice_number: 'INV-1113',
    contact_email: 'cwcausey12@gmail.com',
    customer_name: 'Wendell Causey',
    customer_email: 'wcausey@crimsoncpa.com',
    customer_phone: '770-331-5502',
    job_address: '111 S Driftwood Bay Unit 119, Miramar Beach',
    service_type: 'SERVICE',
    service_date: '2026-03-21',
    invoice_status: 'paid',
    amount_due: 2244.00,
    amount_paid: 2244.00,
    payment_type: 'check',
    service_description: 'Trim Out:\nInstall door hardware x6 @ $25/door: $150\nInstall screen door hardware: $25\nInstall pocket door hardware: $50\nInstall front door hardware: $50\nInstall bathroom hardware x5 @ $25: $125\nInstall master bathroom mirrors x2 @ $50: $100\nInstall bathroom mirrors x2 @ $25: $50\nPaint exterior front door: $25\nInstall register covers x9 @ $25: $225\nInstall weather stripping on front door and storage door: $50\nHang headboards x2 @ $75: $150\nTrim Out Subtotal: $1,000\n\nConstruction Clean: $1,244',
    notes: 'Receipt on file: https://drive.google.com/file/d/14frUTIOlTjl-El87iB4f3ZkuhaYl-Nl0/view?usp=drivesdk',
  },
  {
    invoice_number: 'INV-1114',
    contact_email: 'mhawks@gmail.com',
    customer_name: 'Melanie Hawks',
    customer_email: 'mhawks@hotmail.com',
    customer_phone: '270-309-0402',
    job_address: '171 S Driftwood Bay Unit 104, Miramar Beach',
    service_type: 'DRAW',
    service_date: '2026-03-31',
    invoice_status: 'paid',
    amount_due: 3000.00,
    amount_paid: 3000.00,
    payment_type: 'bank_transfer',
    service_description: 'DRAW 2 of 3 — Project Management: 50% of $6,000 management fee: $3,000',
    notes: 'Receipt on file: https://drive.google.com/file/d/1auIeZ68xnEcNlbbmSEmU1IjS1XTrbF9Y/view?usp=drivesdk',
  },
  {
    invoice_number: 'INV-1115',
    contact_email: 'mhawks@gmail.com',
    customer_name: 'Melanie Hawks',
    customer_email: 'mhawks@hotmail.com',
    customer_phone: '270-309-0402',
    job_address: '171 S Driftwood Bay Unit 104, Miramar Beach',
    service_type: 'SERVICE',
    service_date: '2026-03-31',
    invoice_status: 'paid',
    amount_due: 1500.00,
    amount_paid: 1500.00,
    payment_type: 'bank_transfer',
    service_description: 'Construction clean: $700\nInstall appliances: $150\nMove furniture and hang photos and curtains: $500\nHang TV: $150\nTotal: $1,500',
    notes: 'Receipt on file: https://drive.google.com/file/d/1oh41V-qZgFJJ64Bfu_ECUIQ6JTeRXhkP/view?usp=drivesdk',
  },
]

// ── Run import ───────────────────────────────────────────────
async function run() {
  console.log('━━━ L Price Building Company — Invoice Import ━━━\n')

  // 1. Upsert contacts (match on email)
  console.log('Step 1: Creating contacts...')
  const contactMap = {} // email → id

  for (const c of contacts) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', c.email)
      .single()

    if (existing) {
      contactMap[c.email] = existing.id
      console.log(`  ✓ Contact exists: ${c.first_name} ${c.last_name} (${existing.id})`)
    } else {
      const { data, error } = await supabase
        .from('contacts')
        .insert(c)
        .select('id')
        .single()
      if (error) {
        console.error(`  ✗ Failed to create ${c.first_name} ${c.last_name}:`, error.message)
      } else {
        contactMap[c.email] = data.id
        console.log(`  ✓ Created: ${c.first_name} ${c.last_name} (${data.id})`)
      }
    }
  }

  // 2. Insert invoices
  console.log('\nStep 2: Importing invoices...')
  let imported = 0
  let skipped = 0

  for (const inv of invoices) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', inv.invoice_number)
      .single()

    if (existing) {
      console.log(`  ↩ Skipped (already exists): ${inv.invoice_number}`)
      skipped++
      continue
    }

    const contactId = contactMap[inv.contact_email] || null
    const { contact_email: _ce, ...rest } = inv
    const row = {
      ...rest,
      contact_id: contactId,
      invoice_type: 'invoice',
      paid_at: inv.invoice_status === 'paid' ? new Date(inv.service_date + 'T12:00:00Z').toISOString() : null,
    }

    const { error } = await supabase.from('invoices').insert(row)
    if (error) {
      console.error(`  ✗ Failed ${inv.invoice_number}:`, error.message)
    } else {
      const status = inv.invoice_status === 'paid' ? '✓ PAID' : '→ SENT'
      console.log(`  ${status}  ${inv.invoice_number}  ${inv.customer_name.padEnd(25)}  $${inv.amount_due.toFixed(2)}`)
      imported++
    }
  }

  // 3. Summary
  console.log('\n━━━ Done ━━━')
  console.log(`  Contacts created/found: ${contacts.length}`)
  console.log(`  Invoices imported: ${imported}`)
  console.log(`  Invoices skipped (already existed): ${skipped}`)

  const total = invoices.reduce((s, i) => s + i.amount_due, 0)
  const totalPaid = invoices.filter(i => i.invoice_status === 'paid').reduce((s, i) => s + i.amount_due, 0)
  const totalOutstanding = invoices.filter(i => i.invoice_status === 'sent').reduce((s, i) => s + i.amount_due, 0)
  console.log(`\n  Total invoiced: $${total.toFixed(2)}`)
  console.log(`  Collected:      $${totalPaid.toFixed(2)}`)
  console.log(`  Outstanding:    $${totalOutstanding.toFixed(2)}`)
}

run().catch(console.error)
