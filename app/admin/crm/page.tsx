'use client'
import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, X, Save, Loader2, User, Upload } from 'lucide-react'
import { useRef } from 'react'
import { formatPhone } from '@/lib/utils'

interface Contact { id: string; first_name: string; last_name: string; email: string; phone: string; address: string; city: string; state: string; zip: string; company_name: string; notes: string; source: string; created_at: string }
const empty: Partial<Contact> = { first_name:'',last_name:'',email:'',phone:'',address:'',city:'',state:'',zip:'',company_name:'',notes:'' }

export default function CRMPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Contact | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Contact>>(empty)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetch() }, [])

  async function fetch(q?: string) {
    setLoading(true)
    const res = await window.fetch(q ? `/api/contacts?search=${encodeURIComponent(q)}` : '/api/contacts')
    const data = await res.json()
    setContacts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    try {
      if (editing && selected) {
        await window.fetch('/api/contacts', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:selected.id,...form}) })
      } else {
        await window.fetch('/api/contacts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
      }
      await fetch(); setShowForm(false); setForm(empty); setEditing(false); setSelected(null)
    } finally { setSaving(false) }
  }

  async function del(id: string) {
    if (!confirm('Delete this contact?')) return
    await window.fetch(`/api/contacts?id=${id}`, { method:'DELETE' })
    await fetch()
    if (selected?.id === id) setSelected(null)
  }

  async function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const { default: Papa } = await import('papaparse')
      const result = Papa.parse(text, { header: true, skipEmptyLines: true })
      let imported = 0
      for (const row of result.data as any[]) {
        // Support Google Contacts CSV, Outlook CSV, and generic formats
        const firstName = row['First Name'] || row['Given Name'] || row.first_name || row.FirstName || ''
        const lastName = row['Last Name'] || row['Family Name'] || row.last_name || row.LastName || ''
        if (!firstName && !lastName) continue
        const email = row['E-mail 1 - Value'] || row['E-mail Address'] || row.Email || row.email || row['Email Address'] || ''
        const phone = row['Phone 1 - Value'] || row['Primary Phone'] || row.Phone || row.phone || row['Mobile Phone'] || row['Home Phone'] || ''
        const address = row['Address 1 - Street'] || row['Home Street'] || row.Address || row.address || ''
        const company = row['Organization 1 - Name'] || row.Company || row.company || row['Company Name'] || ''
        const notes = row['Notes'] || row.notes || ''
        const res = await window.fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() || null, phone: phone.trim() || null, address: address.trim() || null, company_name: company.trim() || null, notes: notes.trim() || null, source: 'csv-import' }),
        })
        if (res.ok) imported++
      }
      alert(`Imported ${imported} contacts`)
      await fetch()
    } catch { alert('Failed to import CSV') }
    finally { setImporting(false); if (importRef.current) importRef.current.value = '' }
  }

  const filtered = contacts.filter(c => !search || `${c.first_name} ${c.last_name} ${c.email} ${c.phone} ${c.company_name}`.toLowerCase().includes(search.toLowerCase()))
  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 h-full">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-extrabold text-gray-900">CRM — Contacts</h1><p className="text-gray-500 text-sm">{contacts.length} total</p></div>
        <div className="flex gap-3">
          <label className={`flex items-center gap-2 border border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-xl cursor-pointer hover:bg-gray-50 ${importing ? 'opacity-60 cursor-not-allowed' : ''}`}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importing ? 'Importing...' : 'Import CSV'}
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={importCSV} disabled={importing} />
          </label>
          <button onClick={() => { setForm(empty); setEditing(false); setShowForm(true) }} className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background:'#b8895a' }}>
            <Plus size={16} /> Add Contact
          </button>
        </div>
      </div>
      <div className="relative mb-5">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==='Enter' && fetch(search)} placeholder="Search by name, email, phone..." className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
      </div>
      <div className="flex gap-5 h-[calc(100vh-240px)]">
        <div className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 ${selected ? 'w-2/5' : 'w-full'}`}>
          <div className="overflow-y-auto flex-1">
            {loading ? <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin" style={{ color:'#b8895a' }} /></div>
              : filtered.length === 0 ? <div className="flex flex-col items-center justify-center h-32 text-gray-400"><User size={32} className="opacity-30 mb-2" /><p className="text-sm">No contacts</p></div>
              : filtered.map(c => (
                <div key={c.id} onClick={() => setSelected(c === selected ? null : c)}
                  className={`flex items-center gap-4 px-5 py-4 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected?.id === c.id ? 'bg-blue-50 border-l-2' : ''}`}
                  style={{ borderLeftColor: selected?.id === c.id ? '#b8895a' : 'transparent' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background:'linear-gradient(135deg,#c9a870,#b8895a)' }}>{c.first_name[0]}{c.last_name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{c.first_name} {c.last_name}</div>
                    <div className="text-gray-500 text-xs truncate">{c.email || formatPhone(c.phone || '')}</div>
                    {c.company_name && <div className="text-xs truncate" style={{ color:'#b8895a' }}>{c.company_name}</div>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); setForm({...c}); setEditing(true); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"><Edit2 size={13} /></button>
                    <button onClick={e => { e.stopPropagation(); del(c.id) }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
          </div>
        </div>
        {selected && (
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg" style={{ background:'linear-gradient(135deg,#c9a870,#b8895a)' }}>{selected.first_name[0]}{selected.last_name[0]}</div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selected.first_name} {selected.last_name}</h2>
                    {selected.company_name && <p className="text-sm" style={{ color:'#b8895a' }}>{selected.company_name}</p>}
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1 inline-block capitalize">{selected.source||'manual'}</span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)}><X size={18} className="text-gray-400" /></button>
              </div>
              <div className="space-y-2">
                {selected.phone && <a href={`tel:${selected.phone}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><Phone size={15} style={{ color:'#b8895a' }} /><span className="text-gray-700 text-sm">{formatPhone(selected.phone)}</span></a>}
                {selected.email && <a href={`mailto:${selected.email}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><Mail size={15} style={{ color:'#b8895a' }} /><span className="text-gray-700 text-sm">{selected.email}</span></a>}
                {selected.address && <div className="flex items-start gap-3 p-3 rounded-xl"><MapPin size={15} className="mt-0.5" style={{ color:'#b8895a' }} /><div className="text-sm text-gray-700"><div>{selected.address}</div><div>{[selected.city,selected.state,selected.zip].filter(Boolean).join(', ')}</div></div></div>}
              </div>
              {selected.notes && <div className="mt-5 p-4 bg-yellow-50 rounded-xl border border-yellow-100"><h3 className="text-xs font-bold text-yellow-700 uppercase tracking-wider mb-2">Notes</h3><p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.notes}</p></div>}
              <div className="mt-5 flex gap-3">
                <button onClick={() => { setForm({...selected}); setEditing(true); setShowForm(true) }} className="flex-1 flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-xl" style={{ background:'#b8895a' }}><Edit2 size={14} />Edit</button>
                <button onClick={() => del(selected.id)} className="flex items-center gap-2 bg-red-50 text-red-600 font-semibold px-4 py-2.5 rounded-xl"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {[{l:'First Name*',k:'first_name'},{l:'Last Name*',k:'last_name'},{l:'Email',k:'email',t:'email'},{l:'Phone',k:'phone',t:'tel'},{l:'Address',k:'address',full:true},{l:'City',k:'city'},{l:'State',k:'state'},{l:'ZIP',k:'zip'},{l:'Company Name',k:'company_name',full:true}].map(({l,k,t='text',full}) => (
                <div key={k} className={full ? 'col-span-2' : ''}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{l}</label>
                  <input type={t} value={(form as any)[k]||''} onChange={e => setForm(p => ({...p,[k]:e.target.value}))} className={inputCls} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes||''} onChange={e => setForm(p => ({...p,notes:e.target.value}))} rows={3} className={`${inputCls} resize-none`} />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl disabled:opacity-60" style={{ background:'#b8895a' }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{saving ? 'Saving...' : 'Save Contact'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
