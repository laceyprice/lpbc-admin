'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Search, Send, CheckCircle, FileText, Loader2, X, Save, Edit3, Trash2, Upload, Camera, Receipt, FileImage, BarChart2, TrendingUp, DollarSign, Clock, AlertCircle } from 'lucide-react'
import { formatCurrency, formatDateShort, formatPhone, generateDocNumber } from '@/lib/utils'

interface InvoiceAttachment {
  name: string
  path: string
  url: string
  doc_type: 'receipt' | 'check'
  created_at?: string
  size?: number | null
}

interface Contact { id: string; first_name: string; last_name: string; email: string; phone: string; address: string }
interface Invoice { id: string; invoice_number: string; invoice_type: string; customer_name: string; customer_email: string; customer_phone: string; job_address: string; service_date: string; service_type: string; service_description: string; amount_due: number; amount_paid: number; invoice_status: string; payment_type: string; stripe_payment_link: string; contact_id: string; created_at: string; paid_at: string }

const SC: Record<string, string> = { draft:'bg-gray-100 text-gray-600', sent:'bg-blue-100 text-blue-700', paid:'bg-green-100 text-green-700', overdue:'bg-red-100 text-red-700', approved:'bg-emerald-100 text-emerald-700' }
const SERVICES = ['Service Call','Gas Line Installation','Gas Appliance Connection','Gas Leak Detection','Emergency Repair','Rough-In','Trim-Out','Retrofit','Appliance Installation','Appliance Repair','Pool/Spa Heater','Outdoor Kitchen','Generator Connection','Safety Inspection','Pressure Testing','Inspection & Compliance','Other']

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('invoice')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Invoice>>({ invoice_type:'invoice' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachDocType, setAttachDocType] = useState<'receipt' | 'check'>('receipt')
  const attachCameraRef = useRef<HTMLInputElement>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)
  const [showReport, setShowReport] = useState(false)

  const searchParams = useSearchParams()

  useEffect(() => { loadInvoices(); loadContacts() }, [typeFilter])

  // Handle prefill from schedule requests
  useEffect(() => {
    const prefill = searchParams.get('prefill')
    if (prefill) {
      const params = new URLSearchParams(prefill)
      const type = params.get('type') as 'invoice' | 'quote' || 'invoice'
      setTypeFilter(type)
      setTimeout(() => {
        setForm({
          invoice_type: type,
          invoice_number: generateDocNumber(type, invoices),
          customer_name: params.get('customer_name') || '',
          customer_email: params.get('customer_email') || '',
          customer_phone: params.get('customer_phone') || '',
          job_address: params.get('job_address') || '',
          service_type: params.get('service_type') || '',
          service_description: params.get('notes') || '',
          company_name: params.get('company_name') || '',
        } as any)
        setShowForm(true)
        // Clean URL
        window.history.replaceState({}, '', '/admin/invoices')
      }, 500)
    }
  }, [searchParams])

  async function loadInvoices() {
    setLoading(true)
    const res = await fetch(`/api/invoices?type=${typeFilter}`)
    const d = await res.json()
    setInvoices(Array.isArray(d) ? d : [])
    setLoading(false)
  }
  async function loadContacts() {
    const res = await fetch('/api/contacts'); const d = await res.json(); setContacts(Array.isArray(d) ? d : [])
  }

  function autofill(id: string) {
    const c = contacts.find(x => x.id === id); if (!c) return
    setForm(p => ({ ...p, contact_id:c.id, customer_name:`${c.first_name} ${c.last_name}`, customer_email:c.email, customer_phone:c.phone, job_address:c.address, company_name:(c as any).company_name || '' }))
  }

  function validateForm(): string {
    const required: [string, string][] = [
      ['invoice_type', 'Type'],
      ['invoice_number', 'Document #'],
      ['customer_name', 'Customer Name'],
      ['customer_email', 'Email'],
      ['customer_phone', 'Phone'],
      ['job_address', 'Job Address'],
      ['jobsite_city', 'Jobsite City'],
      ['service_date', 'Service Date'],
      ['amount_due', 'Amount Due'],
      ['service_type', 'Service Type'],
      ['service_description', 'Service Description'],
    ]
    for (const [k, label] of required) {
      const v = (form as any)[k]
      if (v === undefined || v === null || v === '' || (k === 'amount_due' && Number(v) <= 0)) {
        return `${label} is required.`
      }
    }
    if (form.invoice_type !== 'quote' && Number(form.amount_paid) > 0 && !form.payment_type) {
      return 'Payment Type is required when Amount Collected is filled in.'
    }
    return ''
  }

  async function saveForm() {
    const err = validateForm()
    if (err) { setFormError(err); return }
    setFormError('')
    setSaving(true)
    try {
      const method = (form as any).id ? 'PATCH' : 'POST'
      const body = (form as any).id ? { id:(form as any).id, ...form } : form
      const res = await fetch('/api/invoices', { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      if (res.ok) {
        await loadInvoices()
        setShowForm(false)
        setForm({ invoice_type: typeFilter })
      } else {
        const j = await res.json().catch(() => ({}))
        setFormError(j.error || 'Failed to save. Please try again.')
      }
    } finally { setSaving(false) }
  }

  async function sendInvoice(id: string) {
    setSending(id)
    try { const res = await fetch('/api/send-invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({invoiceId:id}) }); if (res.ok) await loadInvoices() }
    finally { setSending(null) }
  }

  async function markPaid(inv: Invoice) {
    await fetch('/api/invoices', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      id: inv.id,
      invoice_status: 'paid',
      amount_paid: inv.amount_due,
      paid_at: new Date().toISOString(),
    })})
    await loadInvoices(); setSelected(null)
  }

  async function markApproved(inv: Invoice) {
    await fetch('/api/invoices', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      id: inv.id,
      invoice_status: 'approved',
    })})
    await loadInvoices(); setSelected(null)
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Are you sure you want to delete this invoice? This cannot be undone.')) return
    await fetch('/api/invoices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await loadInvoices()
    setSelected(null)
  }

  async function convertToInvoice(quote: Invoice) {
    if (!confirm(`Convert Quote ${quote.invoice_number} to an Invoice?`)) return
    const newNumber = generateDocNumber('invoice', invoices)
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_type: 'invoice',
        invoice_number: newNumber,
        invoice_status: 'draft',
        customer_name: quote.customer_name,
        customer_email: quote.customer_email,
        customer_phone: quote.customer_phone,
        job_address: quote.job_address,
        service_date: quote.service_date,
        service_type: quote.service_type,
        service_description: quote.service_description,
        amount_due: quote.amount_due,
        contact_id: quote.contact_id,
        company_name: (quote as any).company_name || '',
        jobsite_city: (quote as any).jobsite_city || '',
      }),
    })
    if (res.ok) {
      setSelected(null)
      setTypeFilter('invoice')
      await loadInvoices()
      alert(`Quote converted! New Invoice ${newNumber} created as draft.`)
    }
  }

  async function loadAttachments(invoiceId: string) {
    setAttachLoading(true)
    try {
      const res = await fetch(`/api/invoice-attachments?invoice_id=${invoiceId}`)
      const d = await res.json()
      setAttachments(Array.isArray(d) ? d : [])
    } catch { setAttachments([]) }
    finally { setAttachLoading(false) }
  }

  async function uploadAttachment(file: File, invoiceId: string) {
    setAttachUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('invoice_id', invoiceId)
      fd.append('doc_type', attachDocType)
      const res = await fetch('/api/invoice-attachments', { method: 'POST', body: fd })
      if (!res.ok) { alert('Upload failed'); return }
      await loadAttachments(invoiceId)
    } catch { alert('Upload failed') }
    finally {
      setAttachUploading(false)
      if (attachCameraRef.current) attachCameraRef.current.value = ''
      if (attachFileRef.current) attachFileRef.current.value = ''
    }
  }

  async function deleteAttachment(path: string, invoiceId: string) {
    if (!confirm('Delete this attachment?')) return
    await fetch(`/api/invoice-attachments?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    await loadAttachments(invoiceId)
  }

  function openDetail(inv: Invoice) {
    setSelected(inv)
    setAttachments([])
    loadAttachments(inv.id)
  }

  const filtered = invoices.filter(i => (filter === 'all' || i.invoice_status === filter) && (!search || `${i.invoice_number} ${i.customer_name} ${i.job_address}`.toLowerCase().includes(search.toLowerCase())))
  const totalDue = filtered.filter(i => i.invoice_status !== 'paid').reduce((s, i) => s + Math.max(0, (i.amount_due||0) - (i.amount_paid||0)), 0)
  const totalPaid = filtered.reduce((s, i) => s + (i.amount_paid||0), 0)

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Invoices & Quotes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Outstanding: {formatCurrency(totalDue)} · Collected: {formatCurrency(totalPaid)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReport(true)}
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700">
            <BarChart2 size={15} /> Report
          </button>
          <button onClick={() => {
              setFormError('')
              setForm({
                invoice_type: typeFilter,
                invoice_number: generateDocNumber(typeFilter as 'invoice' | 'quote', invoices),
              })
              setContactSearch('')
              setShowContactDropdown(false)
              setShowForm(true)
            }}
            className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background:'#b8895a' }}>
            <Plus size={15} /> New {typeFilter === 'quote' ? 'Quote' : 'Invoice'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex bg-gray-100 rounded-xl p-1">
          {['invoice','quote'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${typeFilter===t ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              style={{ color: typeFilter===t ? '#b8895a' : undefined }}>{t}s</button>
          ))}
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1 flex-wrap">
          {['all','draft','sent','approved','paid','overdue'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter===s ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              style={{ color: filter===s ? '#b8895a' : undefined }}>{s}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-44">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['#','Date','Customer','Address','Service','Amount','Status','Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={8} className="text-center py-12"><Loader2 size={22} className="animate-spin mx-auto" style={{ color:'#b8895a' }} /></td></tr>
                : filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No invoices found</td></tr>
                : filtered.map(inv => (
                  <tr key={inv.id} onClick={() => openDetail(inv)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-600">{inv.invoice_number}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">{formatDateShort(inv.created_at)}</td>
                    <td className="px-5 py-3.5"><div className="font-semibold text-gray-900">{inv.customer_name}</div><div className="text-gray-500 text-xs">{inv.customer_email}</div></td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs truncate max-w-40">{inv.job_address || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">{inv.service_type || '—'}</td>
                    <td className="px-5 py-3.5 font-bold text-gray-900">{formatCurrency(inv.amount_due)}</td>
                    <td className="px-5 py-3.5"><span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${SC[inv.invoice_status]||'bg-gray-100 text-gray-600'}`}>{inv.invoice_status}</span></td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => sendInvoice(inv.id)} disabled={!!sending} title={inv.invoice_status === 'sent' ? 'Resend' : 'Send'}
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50">
                          {sending===inv.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        </button>
                        {inv.invoice_status !== 'paid' && inv.invoice_status !== 'approved' && inv.invoice_type === 'quote' && (
                          <button onClick={() => markApproved(inv)} title="Mark approved"
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                            <CheckCircle size={13} />
                          </button>
                        )}
                        {inv.invoice_status !== 'paid' && inv.invoice_type !== 'quote' && (
                          <button onClick={() => markPaid(inv)} title="Mark paid"
                            className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                            <CheckCircle size={13} />
                          </button>
                        )}
                        <button onClick={() => { setForm({...inv}); loadAttachments(inv.id); setShowForm(true) }} className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"><FileText size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-gray-900">{selected.invoice_type === 'quote' ? 'Quote' : 'Invoice'} #{selected.invoice_number}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SC[selected.invoice_status]||''}`}>{selected.invoice_status}</span></div>
              <button onClick={() => setSelected(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[['Customer',selected.customer_name],['Company',(selected as any).company_name],['Email',selected.customer_email],['Phone',formatPhone(selected.customer_phone)],['Job Address',selected.job_address],['Jobsite City',(selected as any).jobsite_city],['Service Date',selected.service_date],['Amount Due',formatCurrency(selected.amount_due)],['Amount Collected',formatCurrency(selected.amount_paid||0)],['Payment Type',selected.payment_type||'Not set'],['Service Type',selected.service_type]].filter(([,v]) => v).map(([k,v]) => (
                  <div key={k} className="bg-gray-50 rounded-xl p-3"><div className="text-xs text-gray-500 mb-0.5">{k}</div><div className="font-semibold text-gray-900">{v||'—'}</div></div>
                ))}
              </div>
              {selected.service_description && <div className="bg-gray-50 rounded-xl p-3"><div className="text-xs text-gray-500 mb-1">Description</div><div className="text-gray-700">{selected.service_description}</div></div>}
              {selected.stripe_payment_link && <a href={selected.stripe_payment_link} target="_blank" className="block text-center text-white py-2.5 rounded-xl font-semibold" style={{ background:'#b8895a' }}>View Payment Link ↗</a>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { sendInvoice(selected.id); setSelected(null) }} className="flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold" style={{ background:'#2563eb' }}>
                  <Send size={14} />{selected.invoice_status === 'sent' || selected.invoice_status === 'approved' ? 'Resend' : 'Send'} {selected.invoice_type === 'quote' ? 'Quote' : 'Invoice'}
                </button>
                {selected.invoice_status !== 'paid' && selected.invoice_status !== 'approved' && (
                  selected.invoice_type === 'quote' ? (
                    <button onClick={() => markApproved(selected)} className="flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold" style={{ background:'#16a34a' }}><CheckCircle size={14} />Mark Approved</button>
                  ) : (
                    <button onClick={() => markPaid(selected)} className="flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold" style={{ background:'#16a34a' }}><CheckCircle size={14} />Mark Paid</button>
                  )
                )}
              </div>
              {selected.invoice_type === 'quote' && (
                <button onClick={() => convertToInvoice(selected)} className="w-full flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold mt-2" style={{ background:'#f59e0b' }}>
                  <FileText size={14} />Convert to Invoice
                </button>
              )}
              {/* Attachments section */}
              <div className="border-t border-gray-100 pt-4 mt-2">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Upload size={14} />Checks & Receipts</h3>

                {/* Type selector + upload buttons */}
                <div className="flex items-center gap-3 mb-3">
                  <select value={attachDocType} onChange={e => setAttachDocType(e.target.value as 'receipt' | 'check')}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:border-blue-400">
                    <option value="receipt">Receipt</option>
                    <option value="check">Check</option>
                  </select>
                  <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all ${attachUploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    {attachUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                    Photo
                    <input ref={attachCameraRef} type="file" accept="image/*" capture="environment" className="hidden" disabled={attachUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f, selected.id) }} />
                  </label>
                  <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all ${attachUploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    {attachUploading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                    File
                    <input ref={attachFileRef} type="file" accept="image/*,.pdf" className="hidden" disabled={attachUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f, selected.id) }} />
                  </label>
                </div>

                {/* Uploaded files list */}
                {attachLoading ? (
                  <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin" style={{ color:'#b8895a' }} /></div>
                ) : attachments.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No attachments yet</p>
                ) : (
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.path} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${att.doc_type === 'receipt' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {att.doc_type === 'receipt' ? 'Receipt' : 'Check'}
                        </span>
                        <a href={att.url} target="_blank" rel="noreferrer" className="flex-1 flex items-center gap-1.5 text-xs font-medium truncate hover:underline" style={{ color:'#b8895a' }}>
                          {att.doc_type === 'receipt' ? <Receipt size={13} /> : <FileImage size={13} />}
                          {att.name}
                        </a>
                        <button onClick={() => deleteAttachment(att.path, selected.id)} className="text-gray-400 hover:text-red-600 transition-colors p-1"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => { setForm({...selected}); loadAttachments(selected.id); setShowForm(true); setSelected(null) }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold border-2 hover:bg-blue-50 transition-colors" style={{ borderColor:'#b8895a', color:'#b8895a' }}><Edit3 size={14} />Edit</button>
                <button onClick={() => deleteInvoice(selected.id)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} />Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (() => {
        const all = invoices
        const isInvoice = typeFilter === 'invoice'

        // --- Invoice stats ---
        const totalBilled = all.reduce((s, i) => s + (i.amount_due || 0), 0)
        const totalCollected = all.reduce((s, i) => s + (i.amount_paid || 0), 0)
        const totalOutstanding = all.filter(i => i.invoice_status !== 'paid' && i.invoice_status !== 'cancelled').reduce((s, i) => s + Math.max(0, (i.amount_due || 0) - (i.amount_paid || 0)), 0)
        const paidCount = all.filter(i => i.invoice_status === 'paid').length
        const overdueCount = all.filter(i => i.invoice_status === 'overdue').length
        const sentCount = all.filter(i => i.invoice_status === 'sent').length
        const draftCount = all.filter(i => i.invoice_status === 'draft').length

        // --- Quote stats ---
        const approvedCount = all.filter(i => i.invoice_status === 'approved').length
        const pendingCount = all.filter(i => i.invoice_status === 'draft' || i.invoice_status === 'sent').length
        const totalQuoted = all.reduce((s, i) => s + (i.amount_due || 0), 0)
        const approvedValue = all.filter(i => i.invoice_status === 'approved').reduce((s, i) => s + (i.amount_due || 0), 0)
        const approvalRate = all.length > 0 ? Math.round((approvedCount / all.length) * 100) : 0

        // --- By service type ---
        const byService: Record<string, { count: number; amount: number }> = {}
        all.forEach(i => {
          const k = i.service_type || 'Unspecified'
          if (!byService[k]) byService[k] = { count: 0, amount: 0 }
          byService[k].count++
          byService[k].amount += i.amount_due || 0
        })
        const serviceRows = Object.entries(byService).sort((a, b) => b[1].amount - a[1].amount)
        const maxServiceAmount = serviceRows[0]?.[1].amount || 1

        // --- Monthly breakdown (last 6 months) ---
        const monthlyMap: Record<string, { billed: number; collected: number; count: number }> = {}
        const now = new Date()
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          monthlyMap[key] = { billed: 0, collected: 0, count: 0 }
        }
        all.forEach(inv => {
          const d = new Date(inv.created_at)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (monthlyMap[key]) {
            monthlyMap[key].billed += inv.amount_due || 0
            monthlyMap[key].collected += inv.amount_paid || 0
            monthlyMap[key].count++
          }
        })
        const monthlyRows = Object.entries(monthlyMap)
        const maxMonthlyBilled = Math.max(...monthlyRows.map(([, v]) => v.billed), 1)
        const monthLabels: Record<string, string> = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' }

        const statCard = (icon: React.ReactNode, label: string, value: string, sub?: string, color = '#b8895a') => (
          <div className="bg-gray-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2" style={{ color }}>{icon}<span className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</span></div>
            <div className="text-2xl font-extrabold text-gray-900">{value}</div>
            {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
          </div>
        )

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <BarChart2 size={18} style={{ color:'#b8895a' }} />
                    {isInvoice ? 'Invoice Report' : 'Quote Report'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">{all.length} {isInvoice ? 'invoice' : 'quote'}{all.length !== 1 ? 's' : ''} total</p>
                </div>
                <button onClick={() => setShowReport(false)}><X size={18} className="text-gray-400" /></button>
              </div>

              <div className="p-6 space-y-6">
                {isInvoice ? (
                  <>
                    {/* Invoice summary cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {statCard(<DollarSign size={14} />, 'Total Billed', formatCurrency(totalBilled), `${all.length} invoices`)}
                      {statCard(<CheckCircle size={14} />, 'Total Collected', formatCurrency(totalCollected), `${paidCount} paid`, '#16a34a')}
                      {statCard(<Clock size={14} />, 'Outstanding', formatCurrency(totalOutstanding), `${sentCount} sent`, '#d97706')}
                      {statCard(<AlertCircle size={14} />, 'Overdue', `${overdueCount}`, overdueCount > 0 ? 'Needs attention' : 'All clear', overdueCount > 0 ? '#dc2626' : '#16a34a')}
                    </div>

                    {/* Status breakdown */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-800 mb-3">Status Breakdown</h3>
                      <div className="space-y-2">
                        {[
                          { label: 'Paid', count: paidCount, color: '#16a34a' },
                          { label: 'Sent / Awaiting', count: sentCount, color: '#2563eb' },
                          { label: 'Draft', count: draftCount, color: '#9ca3af' },
                          { label: 'Overdue', count: overdueCount, color: '#dc2626' },
                        ].map(({ label, count, color }) => (
                          <div key={label} className="flex items-center gap-3">
                            <div className="w-24 text-xs font-semibold text-gray-600 shrink-0">{label}</div>
                            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: all.length > 0 ? `${(count / all.length) * 100}%` : '0%', background: color }} />
                            </div>
                            <div className="w-8 text-xs font-bold text-gray-700 text-right">{count}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Monthly chart */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-800 mb-3">Monthly Activity (last 6 months)</h3>
                      <div className="flex items-end gap-2 h-32">
                        {monthlyRows.map(([key, val]) => {
                          const month = key.split('-')[1]
                          const billedH = Math.round((val.billed / maxMonthlyBilled) * 100)
                          const collectedH = Math.round((val.collected / maxMonthlyBilled) * 100)
                          return (
                            <div key={key} className="flex-1 flex flex-col items-center gap-1">
                              <div className="w-full flex items-end gap-0.5 h-24">
                                <div className="flex-1 rounded-t-md transition-all" style={{ height: `${billedH}%`, background: '#bfdbfe', minHeight: val.billed > 0 ? 4 : 0 }} title={`Billed: ${formatCurrency(val.billed)}`} />
                                <div className="flex-1 rounded-t-md transition-all" style={{ height: `${collectedH}%`, background: '#b8895a', minHeight: val.collected > 0 ? 4 : 0 }} title={`Collected: ${formatCurrency(val.collected)}`} />
                              </div>
                              <div className="text-xs text-gray-400 font-medium">{monthLabels[month]}</div>
                              {val.count > 0 && <div className="text-xs text-gray-500">{val.count}</div>}
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-200 inline-block" />Billed</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ background:'#b8895a' }} />Collected</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Quote summary cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {statCard(<DollarSign size={14} />, 'Total Quoted', formatCurrency(totalQuoted), `${all.length} quotes`)}
                      {statCard(<CheckCircle size={14} />, 'Approved Value', formatCurrency(approvedValue), `${approvedCount} approved`, '#16a34a')}
                      {statCard(<TrendingUp size={14} />, 'Approval Rate', `${approvalRate}%`, approvedCount > 0 ? `${approvedCount} of ${all.length}` : 'No approvals yet')}
                      {statCard(<Clock size={14} />, 'Pending', `${pendingCount}`, 'Awaiting response', '#d97706')}
                    </div>

                    {/* Status breakdown */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-800 mb-3">Status Breakdown</h3>
                      <div className="space-y-2">
                        {[
                          { label: 'Approved', count: approvedCount, color: '#16a34a' },
                          { label: 'Sent', count: all.filter(i => i.invoice_status === 'sent').length, color: '#2563eb' },
                          { label: 'Draft', count: draftCount, color: '#9ca3af' },
                        ].map(({ label, count, color }) => (
                          <div key={label} className="flex items-center gap-3">
                            <div className="w-24 text-xs font-semibold text-gray-600 shrink-0">{label}</div>
                            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: all.length > 0 ? `${(count / all.length) * 100}%` : '0%', background: color }} />
                            </div>
                            <div className="w-8 text-xs font-bold text-gray-700 text-right">{count}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* By service type — shown on both */}
                {serviceRows.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 mb-3">By Service Type</h3>
                    <div className="space-y-2.5">
                      {serviceRows.map(([service, { count, amount }]) => (
                        <div key={service}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-gray-700 truncate max-w-[200px]">{service}</span>
                            <span className="text-gray-500 ml-2 shrink-0">{formatCurrency(amount)} · {count} job{count !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(amount / maxServiceAmount) * 100}%`, background:'#b8895a' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {all.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <BarChart2 size={28} className="mx-auto mb-2 opacity-30" />
                    No data yet — {isInvoice ? 'invoices' : 'quotes'} will appear here once created.
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Create/Edit form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{(form as any).id ? 'Edit' : 'New'} {form.invoice_type === 'quote' ? 'Quote' : 'Invoice'}</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Autofill from existing customer</label>
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => { setContactSearch(e.target.value); setShowContactDropdown(true) }}
                  onFocus={() => setShowContactDropdown(true)}
                  placeholder="Type a name to search contacts..."
                  className={inputCls}
                />
                {showContactDropdown && contactSearch.length > 0 && (() => {
                  const q = contactSearch.toLowerCase()
                  const matches = contacts
                    .filter(c => `${c.first_name} ${c.last_name} ${c.email} ${c.phone}`.toLowerCase().includes(q))
                    .sort((a, b) => {
                      const aName = `${a.first_name} ${a.last_name}`.toLowerCase()
                      const bName = `${b.first_name} ${b.last_name}`.toLowerCase()
                      const aStarts = aName.startsWith(q) || a.first_name?.toLowerCase().startsWith(q) ? 0 : 1
                      const bStarts = bName.startsWith(q) || b.first_name?.toLowerCase().startsWith(q) ? 0 : 1
                      if (aStarts !== bStarts) return aStarts - bStarts
                      return aName.localeCompare(bName)
                    })
                    .slice(0, 8)
                  if (matches.length === 0) return (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm text-gray-400">No contacts found</div>
                  )
                  return (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {matches.map(c => (
                        <button key={c.id} type="button"
                          onClick={() => { autofill(c.id); setContactSearch(`${c.first_name} ${c.last_name}`); setShowContactDropdown(false) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm flex items-center justify-between border-b border-gray-50 last:border-0">
                          <span className="font-medium text-gray-900">{c.first_name} {c.last_name}</span>
                          <span className="text-xs text-gray-400 truncate ml-2">{c.email || formatPhone(c.phone || '')}</span>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-gray-700 mb-1">Type *</label>
                  <select value={form.invoice_type||'invoice'} onChange={e => {
                      const newType = e.target.value as 'invoice' | 'quote'
                      setForm(p => ({
                        ...p,
                        invoice_type: newType,
                        // re-generate the doc number to use the right prefix when type flips on a new doc
                        invoice_number: (form as any).id ? p.invoice_number : generateDocNumber(newType, invoices),
                      }))
                    }} className={inputCls}>
                    <option value="invoice">Invoice</option><option value="quote">Quote</option>
                  </select>
                </div>
                <div><label className="block text-sm font-semibold text-gray-700 mb-1">{form.invoice_type === 'quote' ? 'Quote' : 'Invoice'} # *</label>
                  <input value={form.invoice_number||''} onChange={e => setForm(p => ({...p,invoice_number:e.target.value}))} className={inputCls} required />
                </div>
                {[
                  {l:'Customer Name *',k:'customer_name'},
                  {l:'Company Name',k:'company_name',r:false},
                  {l:'Email *',k:'customer_email',t:'email'},
                  {l:'Phone *',k:'customer_phone',t:'tel'},
                  {l:'Job Address *',k:'job_address'},
                  {l:'Jobsite City *',k:'jobsite_city'},
                  {l:'Service Date *',k:'service_date',t:'date'},
                  {l:'Amount Due *',k:'amount_due',t:'number'},
                ].map(({l,k,t='text',r=true}) => (
                  <div key={k}>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">{l}</label>
                    <input type={t} step={t==='number'?'0.01':undefined} value={(form as any)[k]||''} onChange={e => setForm(p => ({...p,[k]:t==='number'?parseFloat(e.target.value)||0:e.target.value}))} className={inputCls} required={r} />
                  </div>
                ))}
                {form.invoice_type !== 'quote' && (<>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Amount Collected</label>
                  <input type="number" step="0.01" min="0" value={form.amount_paid ?? ''} onChange={e => setForm(p => ({...p, amount_paid: parseFloat(e.target.value) || 0}))} className={inputCls} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Payment Type{Number(form.amount_paid) > 0 ? ' *' : ''}
                  </label>
                  <select value={form.payment_type||''} onChange={e => setForm(p => ({...p,payment_type:e.target.value}))} className={inputCls} required={Number(form.amount_paid) > 0}>
                    <option value="">Select...</option>
                    <option value="cash">Cash</option><option value="check">Check</option><option value="card">Credit/Debit Card</option><option value="stripe">Stripe (online)</option>
                  </select>
                </div>
                </>)}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Service Type *</label>
                  <select value={form.service_type||''} onChange={e => setForm(p => ({...p,service_type:e.target.value}))} className={inputCls} required>
                    <option value="">Select...</option>{SERVICES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Service Description * (grammar auto-corrected on save)</label>
                <textarea value={form.service_description||''} onChange={e => setForm(p => ({...p,service_description:e.target.value}))} rows={3} placeholder="Describe service performed..." className={`${inputCls} resize-none`} required />
              </div>

              {/* Check image upload — only on invoices, only when editing an existing record */}
              {form.invoice_type !== 'quote' && (form as any).id && (
                <div className="border border-dashed border-gray-200 rounded-2xl p-4">
                  <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><FileImage size={14} />Check Image</h3>
                  <div className="flex items-center gap-3">
                    <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-blue-300 text-sm font-semibold cursor-pointer hover:bg-blue-50 transition-all ${attachUploading ? 'opacity-60 cursor-not-allowed' : ''}`} style={{ color:'#b8895a' }}>
                      {attachUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                      Take Photo
                      <input type="file" accept="image/*" capture="environment" className="hidden" disabled={attachUploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) { setAttachDocType('check'); uploadAttachment(f, (form as any).id) }}} />
                    </label>
                    <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-semibold cursor-pointer hover:bg-gray-50 transition-all ${attachUploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      {attachUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      Upload File
                      <input type="file" accept="image/*,.pdf" className="hidden" disabled={attachUploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) { setAttachDocType('check'); uploadAttachment(f, (form as any).id) }}} />
                    </label>
                  </div>
                  {attachments.filter(a => a.doc_type === 'check').length > 0 && (
                    <div className="mt-3 space-y-2">
                      {attachments.filter(a => a.doc_type === 'check').map(att => (
                        <div key={att.path} className="flex items-center gap-3 bg-blue-50 rounded-xl px-3 py-2">
                          <FileImage size={13} className="text-blue-600 shrink-0" />
                          <a href={att.url} target="_blank" rel="noreferrer" className="flex-1 text-xs font-medium truncate hover:underline" style={{ color:'#b8895a' }}>{att.name}</a>
                          <button onClick={() => deleteAttachment(att.path, (form as any).id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {attachments.filter(a => a.doc_type === 'check').length === 0 && !attachUploading && (
                    <p className="text-xs text-gray-400 mt-2">No check image uploaded yet</p>
                  )}
                </div>
              )}
              {form.invoice_type !== 'quote' && !(form as any).id && (
                <p className="text-xs text-gray-400 flex items-center gap-1.5"><FileImage size={12} />Save the invoice first, then reopen it to upload a check image.</p>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{formError}</div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={saveForm} disabled={saving} className="flex-1 flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl disabled:opacity-60" style={{ background:'#b8895a' }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{saving ? 'Saving...' : `Save ${form.invoice_type==='quote'?'Quote':'Invoice'}`}
              </button>
              <button onClick={() => setShowForm(false)} className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
