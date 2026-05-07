'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Package, Plus, Search, X, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Edit3, Trash2, Minus, RefreshCw,
  BarChart3, MapPin, ArrowUpCircle, ArrowDownCircle, Sparkles,
  Home, Flame, Droplets, Filter, Download, Upload, ClipboardList,
  AlertCircle, Clock,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────
type InventoryItem = {
  id: string
  name: string
  description?: string
  sku?: string
  category: string
  unit: string
  quantity_on_hand: number
  reorder_point: number
  reorder_quantity: number
  unit_cost?: number
  supplier?: string
  gas_type: string
  is_low_stock?: boolean
  is_out_of_stock?: boolean
  notes?: string
}

type PropertyMaterial = {
  id: string
  item_name: string
  category: string
  quantity: number
  unit: string
  unit_cost?: number
  source: string
  date_used: string
  property_address?: string
  notes?: string
  contact?: { id: string; first_name: string; last_name: string }
  worksite?: { id: string; name: string; address: string }
  invoice?: { id: string; invoice_number: string; service_type?: string }
}

type CatalogItem = {
  category: string
  name: string
  unit: string
  gas_type: string
  reorder_point: number
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  regulators:      { label: 'Regulators',       color: 'bg-blue-100 text-blue-800' },
  valves:          { label: 'Valves',            color: 'bg-purple-100 text-purple-800' },
  pipe_fittings:   { label: 'Pipe & Fittings',   color: 'bg-orange-100 text-orange-800' },
  connectors:      { label: 'Connectors & Hose', color: 'bg-teal-100 text-teal-800' },
  lp_tank:         { label: 'LP / Tank',         color: 'bg-yellow-100 text-yellow-800' },
  appliance_parts: { label: 'Appliance Parts',   color: 'bg-pink-100 text-pink-800' },
  safety:          { label: 'Safety & Testing',  color: 'bg-red-100 text-red-800' },
  consumables:     { label: 'Consumables',        color: 'bg-green-100 text-green-800' },
  tools:           { label: 'Tools',             color: 'bg-gray-100 text-gray-800' },
  other:           { label: 'Other',             color: 'bg-slate-100 text-slate-600' },
}

const GAS_TYPES = [
  { value: 'both', label: 'NG & LP' },
  { value: 'natural_gas', label: 'Natural Gas' },
  { value: 'propane', label: 'Propane / LP' },
]

const UNITS = ['each', 'ft', 'lb', 'gallon', 'box', 'roll', 'pair', 'kit', 'set']

function CategoryBadge({ cat }: { cat: string }) {
  const c = CATEGORIES[cat] || CATEGORIES.other
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>
}

function GasTypeBadge({ t }: { t: string }) {
  if (t === 'natural_gas') return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">NG</span>
  if (t === 'propane') return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">LP</span>
  return (
    <span className="flex gap-1">
      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">NG</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">LP</span>
    </span>
  )
}

export default function InventoryPage() {
  const [tab, setTab] = useState<'inventory' | 'materials' | 'suppliers' | 'history'>('inventory')

  // Materials Lists state
  type MaterialsList = { id: string; name: string; worksite_id?: string | null; property_address?: string | null; customer_name?: string | null; service_type?: string | null; scheduled_date?: string | null; status: string; notes?: string | null; items?: any[] }
  const [lists, setLists] = useState<MaterialsList[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [newListForm, setNewListForm] = useState<Partial<MaterialsList>>({ status: 'draft' })
  const [savingList, setSavingList] = useState(false)
  const [expandedList, setExpandedList] = useState<string | null>(null)
  const [listItems, setListItems] = useState<Record<string, any[]>>({})
  const [worksiteOptions, setWorksiteOptions] = useState<any[]>([])
  const [newItemFor, setNewItemFor] = useState<string | null>(null)
  const [newItemQty, setNewItemQty] = useState('1')
  const [newItemId, setNewItemId] = useState('')

  async function loadLists() {
    setListsLoading(true)
    try {
      const res = await fetch('/api/materials-lists')
      const d = await res.json()
      setLists(Array.isArray(d) ? d : [])
    } finally { setListsLoading(false) }
  }

  async function syncListsFromCalendar() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/materials-lists?action=sync-calendar', { method: 'POST' })
      const ct = res.headers.get('content-type') || ''
      const raw = await res.text()
      if (!ct.includes('application/json')) {
        setSyncResult(`Server returned ${res.status}. The latest image may not be deployed yet.`)
        return
      }
      const d = JSON.parse(raw)
      if (res.ok) {
        setSyncResult(`Created ${d.lists_created || 0} lists with ${d.items_added || 0} items from ${d.appointments_scanned || 0} appointments`)
        await loadLists()
      } else {
        setSyncResult(`Error: ${d.error || 'sync failed'}`)
      }
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`)
    } finally { setSyncing(false) }
  }

  async function loadWorksiteOptions() {
    if (worksiteOptions.length > 0) return
    const res = await fetch('/api/worksites').catch(() => null)
    if (res?.ok) {
      const d = await res.json()
      setWorksiteOptions(Array.isArray(d) ? d : [])
    }
  }

  async function createList() {
    if (!newListForm.name) return
    setSavingList(true)
    try {
      const res = await fetch('/api/materials-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newListForm),
      })
      if (res.ok) {
        await loadLists()
        setShowNewList(false)
        setNewListForm({ status: 'draft' })
      }
    } finally { setSavingList(false) }
  }

  async function deleteList(id: string) {
    if (!confirm('Delete this materials list and all its items?')) return
    await fetch(`/api/materials-lists?id=${id}`, { method: 'DELETE' })
    await loadLists()
  }

  async function expandList(id: string) {
    if (expandedList === id) {
      setExpandedList(null)
      return
    }
    if (!listItems[id]) {
      const res = await fetch(`/api/materials-lists?id=${id}`)
      const d = await res.json()
      setListItems(prev => ({ ...prev, [id]: d.items || [] }))
    }
    setExpandedList(id)
    setNewItemFor(id)
  }

  async function addItemToList(listId: string) {
    if (!newItemId) return
    const item = items.find(i => i.id === newItemId)
    if (!item) return
    await fetch('/api/materials-lists?action=add-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        list_id: listId,
        inventory_item_id: item.id,
        item_name: item.name,
        category: item.category,
        unit: item.unit,
        unit_cost: item.unit_cost || null,
        supplier: item.supplier || null,
        quantity_needed: Number(newItemQty) || 1,
      }),
    })
    // Refresh items
    const res = await fetch(`/api/materials-lists?id=${listId}`)
    const d = await res.json()
    setListItems(prev => ({ ...prev, [listId]: d.items || [] }))
    setNewItemId('')
    setNewItemQty('1')
    await loadLists() // refresh count badges
  }

  async function toggleItemFulfilled(listId: string, itemId: string, fulfilled: boolean) {
    await fetch('/api/materials-lists?action=item', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, fulfilled }),
    })
    setListItems(prev => ({
      ...prev,
      [listId]: (prev[listId] || []).map(it => it.id === itemId ? { ...it, fulfilled } : it),
    }))
  }

  async function deleteListItem(listId: string, itemId: string) {
    await fetch(`/api/materials-lists?item_id=${itemId}`, { method: 'DELETE' })
    setListItems(prev => ({ ...prev, [listId]: (prev[listId] || []).filter(it => it.id !== itemId) }))
    await loadLists()
  }

  // Suppliers state
  type Supplier = { id: string; name: string; contact_name?: string; contact_email?: string; contact_phone?: string; website?: string; account_number?: string; address?: string; notes?: string; items?: any[]; is_active?: boolean }
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({})
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)
  const [supplierItems, setSupplierItems] = useState<Record<string, any[]>>({})

  async function loadSuppliers() {
    setSuppliersLoading(true)
    const res = await fetch('/api/suppliers')
    const d = await res.json()
    setSuppliers(Array.isArray(d) ? d : [])
    setSuppliersLoading(false)
  }

  async function saveSupplier() {
    setSavingSupplier(true)
    try {
      if (editSupplier) {
        await fetch('/api/suppliers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editSupplier.id, ...supplierForm }),
        })
      } else {
        await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(supplierForm),
        })
      }
      await loadSuppliers()
      setShowAddSupplier(false)
      setEditSupplier(null)
      setSupplierForm({})
    } finally { setSavingSupplier(false) }
  }

  async function deleteSupplier(id: string) {
    if (!confirm('Delete this supplier? Inventory items will be unassigned but kept.')) return
    await fetch(`/api/suppliers?id=${id}`, { method: 'DELETE' })
    await loadSuppliers()
  }

  async function expandSupplier(id: string) {
    if (expandedSupplier === id) {
      setExpandedSupplier(null)
      return
    }
    if (!supplierItems[id]) {
      const res = await fetch(`/api/suppliers?id=${id}`)
      const d = await res.json()
      setSupplierItems(prev => ({ ...prev, [id]: d.items || [] }))
    }
    setExpandedSupplier(id)
  }

  async function assignItemToSupplier(itemId: string, supplierId: string | null) {
    await fetch('/api/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, supplier_id: supplierId }),
    })
    await loadInventory()
    // Refresh supplier item list cache
    setSupplierItems({})
    if (expandedSupplier) {
      const res = await fetch(`/api/suppliers?id=${expandedSupplier}`)
      const d = await res.json()
      setSupplierItems(prev => ({ ...prev, [expandedSupplier]: d.items || [] }))
    }
  }
  const [items, setItems] = useState<InventoryItem[]>([])
  const [materials, setMaterials] = useState<PropertyMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [gasFilter, setGasFilter] = useState('all')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [matSearch, setMatSearch] = useState('')

  // Modals
  const [showAdd, setShowAdd] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [showAdjust, setShowAdjust] = useState<InventoryItem | null>(null)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  // Price search modal
  const [priceSearchItem, setPriceSearchItem] = useState<InventoryItem | null>(null)
  const [priceSearchLoading, setPriceSearchLoading] = useState(false)
  const [priceSearchResults, setPriceSearchResults] = useState<any | null>(null)
  const [priceSearchError, setPriceSearchError] = useState('')

  async function runPriceSearch(item: InventoryItem) {
    setPriceSearchItem(item)
    setPriceSearchLoading(true)
    setPriceSearchResults(null)
    setPriceSearchError('')
    try {
      const res = await fetch(`/api/inventory?action=price-search&id=${item.id}`)
      const ct = res.headers.get('content-type') || ''
      const raw = await res.text()
      // If the server returned HTML (404, 500 page, etc.), show a useful message
      if (!ct.includes('application/json')) {
        const isNotFound = raw.includes('404') || res.status === 404
        throw new Error(
          isNotFound
            ? 'Price-search endpoint not found — the new image may not be deployed yet. Redeploy on Flux and try again.'
            : `Server returned ${res.status}. ${raw.slice(0, 200)}`
        )
      }
      const d = JSON.parse(raw)
      if (!res.ok) throw new Error(d.error || `Search failed (${res.status})`)
      setPriceSearchResults(d)
    } catch (e: any) {
      setPriceSearchError(e.message)
    } finally {
      setPriceSearchLoading(false)
    }
  }

  async function applyCheapestPrice() {
    if (!priceSearchItem || !priceSearchResults?.cheapest_price) return
    await fetch('/api/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: priceSearchItem.id,
        unit_cost: priceSearchResults.cheapest_price,
        supplier: priceSearchResults.cheapest_supplier,
      }),
    })
    await loadInventory()
    setPriceSearchItem(null)
    setPriceSearchResults(null)
  }

  const loadInventory = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/inventory')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  const loadMaterials = useCallback(async () => {
    const url = matSearch
      ? `/api/property-materials?search=${encodeURIComponent(matSearch)}`
      : '/api/property-materials'
    const res = await fetch(url)
    const data = await res.json()
    setMaterials(Array.isArray(data) ? data : [])
  }, [matSearch])

  useEffect(() => { loadInventory() }, [loadInventory])
  useEffect(() => { if (tab === 'materials') { loadMaterials(); loadLists(); loadWorksiteOptions() } }, [tab, loadMaterials])

  // Derived / filtered list
  const filtered = items.filter(item => {
    if (catFilter !== 'all' && item.category !== catFilter) return false
    if (gasFilter !== 'all' && item.gas_type !== gasFilter && item.gas_type !== 'both') return false
    if (lowStockOnly && !item.is_low_stock && !item.is_out_of_stock) return false
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const lowStockCount = items.filter(i => i.is_low_stock || i.is_out_of_stock).length

  async function syncFromCalendar() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/property-materials?action=sync-calendar')
      const d = await res.json()
      if (res.ok) setSyncResult(`Imported ${d.imported || 0} materials from ${d.scanned || 0} appointments`)
      else setSyncResult(`Error: ${d.error || 'sync failed'}`)
      await loadMaterials()
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`)
    } finally { setSyncing(false) }
  }

  async function syncFromInvoices() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/property-materials?action=sync-invoices')
      const data = await res.json()
      setSyncResult(`Scanned ${data.scanned} invoices · Imported ${data.imported} material records`)
      if (tab === 'materials') loadMaterials()
    } catch { setSyncResult('Sync failed') }
    setSyncing(false)
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this item from inventory?')) return
    await fetch(`/api/inventory?id=${id}`, { method: 'DELETE' })
    loadInventory()
  }

  async function deleteMaterial(id: string) {
    if (!confirm('Remove this material record?')) return
    await fetch(`/api/property-materials?id=${id}`, { method: 'DELETE' })
    loadMaterials()
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package size={22} className="text-blue-600" /> Materials &amp; Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track parts, supplies, and what&apos;s been used at each property
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'inventory' && (
            <>
              <button onClick={() => setShowCatalog(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100">
                <Sparkles size={15} /> Import Catalog
              </button>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                <Plus size={15} /> Add Item
              </button>
            </>
          )}
          {tab === 'materials' && (
            <button onClick={syncFromCalendar} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700">
              {syncing ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Sync from Calendar
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b px-6 py-3 flex gap-6 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <Package size={16} className="text-blue-500" />
          <span className="font-semibold text-gray-900">{items.length}</span> items tracked
        </div>
        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 text-amber-600 font-medium cursor-pointer"
            onClick={() => { setLowStockOnly(true); setTab('inventory') }}>
            <AlertTriangle size={16} />
            {lowStockCount} low / out of stock
          </div>
        )}
        <div className="flex items-center gap-2 text-gray-600">
          <ClipboardList size={16} className="text-green-500" />
          <span className="font-semibold text-gray-900">{materials.length}</span> material records
        </div>
        {items.filter(i => i.unit_cost).length > 0 && (
          <div className="flex items-center gap-2 text-gray-600">
            <BarChart3 size={16} className="text-purple-500" />
            Est. value: <span className="font-semibold text-gray-900">
              ${items.reduce((s, i) => s + (i.unit_cost || 0) * i.quantity_on_hand, 0).toFixed(0)}
            </span>
          </div>
        )}
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="mx-6 mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={16} />{syncResult}</span>
          <button onClick={() => setSyncResult(null)}><X size={15} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-1">
          {([
            ['inventory', 'Inventory', Package],
            ['materials', 'Worksite Materials', MapPin],
            ['suppliers', 'Suppliers', Home],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => { setTab(key); if (key === 'suppliers' && suppliers.length === 0) loadSuppliers() }}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── INVENTORY TAB ──────────────────────────────────────── */}
      {tab === 'inventory' && (
        <div className="flex-1 overflow-auto p-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search items…"
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Categories</option>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select value={gasFilter} onChange={e => setGasFilter(e.target.value)}
              className="text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">NG & LP</option>
              <option value="natural_gas">Natural Gas only</option>
              <option value="propane">Propane / LP only</option>
            </select>
            <button onClick={() => setLowStockOnly(!lowStockOnly)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                lowStockOnly ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <AlertTriangle size={14} /> Low Stock Only
            </button>
            {(search || catFilter !== 'all' || gasFilter !== 'all' || lowStockOnly) && (
              <button onClick={() => { setSearch(''); setCatFilter('all'); setGasFilter('all'); setLowStockOnly(false) }}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
                <X size={14} /> Clear
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Package size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">
                {items.length === 0 ? 'No inventory yet' : 'No items match your filters'}
              </p>
              {items.length === 0 && (
                <div className="flex gap-3 justify-center mt-4">
                  <button onClick={() => setShowCatalog(true)}
                    className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1.5">
                    <Sparkles size={15} /> Import from Catalog
                  </button>
                  <button onClick={() => setShowAdd(true)}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5">
                    <Plus size={15} /> Add First Item
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Group by category */
            Object.entries(CATEGORIES).map(([catKey, catMeta]) => {
              const group = filtered.filter(i => i.category === catKey)
              if (!group.length) return null
              return (
                <div key={catKey} className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${catMeta.color.replace('text-', 'bg-').split(' ')[0]}`} />
                    {catMeta.label} <span className="font-normal normal-case">({group.length})</span>
                  </h3>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500">Item</th>
                          <th className="text-left px-3 py-2.5 font-medium text-gray-500 hidden sm:table-cell">Gas</th>
                          <th className="text-center px-3 py-2.5 font-medium text-gray-500">In Stock</th>
                          <th className="text-center px-3 py-2.5 font-medium text-gray-500 hidden md:table-cell">Reorder At</th>
                          <th className="text-right px-3 py-2.5 font-medium text-gray-500 hidden md:table-cell">Unit Cost</th>
                          <th className="px-3 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((item, idx) => (
                          <tr key={item.id}
                            className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx === group.length - 1 ? 'border-b-0' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{item.name}</div>
                              {item.sku && <div className="text-xs text-gray-400">SKU: {item.sku}</div>}
                              {item.supplier && <div className="text-xs text-gray-400">{item.supplier}</div>}
                            </td>
                            <td className="px-3 py-3 hidden sm:table-cell">
                              <GasTypeBadge t={item.gas_type} />
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-xs ${
                                item.is_out_of_stock
                                  ? 'bg-red-100 text-red-700'
                                  : item.is_low_stock
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-green-100 text-green-700'}`}>
                                {item.is_out_of_stock && <AlertCircle size={11} />}
                                {item.is_low_stock && !item.is_out_of_stock && <AlertTriangle size={11} />}
                                {!item.is_low_stock && !item.is_out_of_stock && <CheckCircle2 size={11} />}
                                {item.quantity_on_hand} {item.unit}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center text-gray-500 hidden md:table-cell">
                              {item.reorder_point > 0 ? `${item.reorder_point} ${item.unit}` : '—'}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-600 hidden md:table-cell">
                              {item.unit_cost ? `$${item.unit_cost.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => runPriceSearch(item)}
                                  title="AI: Find cheapest price online"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
                                  <Sparkles size={16} />
                                </button>
                                <button onClick={() => setShowAdjust(item)}
                                  title="Adjust stock"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                  <ArrowUpCircle size={16} />
                                </button>
                                <button onClick={() => setEditItem(item)}
                                  title="Edit"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                                  <Edit3 size={16} />
                                </button>
                                <button onClick={() => deleteItem(item.id)}
                                  title="Remove"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── WORKSITE MATERIALS TAB ─────────────────────────────── */}
      {tab === 'materials' && (
        <div className="flex-1 overflow-auto p-6">
          {/* Materials Lists section (planning) */}
          <div className="flex items-center justify-between mb-3 gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">Materials Lists</h2>
              <p className="text-xs text-gray-500">Pre-job planning lists, grouped by worksite. Click an item to mark it staged.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={syncListsFromCalendar} disabled={syncing}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
                {syncing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Sync from Calendar
              </button>
              <button onClick={() => { setNewListForm({ status: 'draft' }); setShowNewList(true) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm" style={{ background: '#b8895a' }}>
                <Plus size={14} />New Materials List
              </button>
            </div>
          </div>

          {listsLoading ? (
            <div className="flex justify-center py-8"><RefreshCw size={20} className="animate-spin text-gray-400" /></div>
          ) : lists.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center mb-6">
              <ClipboardList size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-semibold text-gray-700 mb-1">No materials lists yet</p>
              <p className="text-xs text-gray-500 mb-3">Create a list to plan what's needed for an upcoming job, then check items off as you stage them.</p>
            </div>
          ) : (() => {
            // Group lists by jobsite address (or "Unassigned")
            const grouped: Record<string, MaterialsList[]> = {}
            for (const l of lists) {
              const key = l.property_address || 'Unassigned'
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(l)
            }
            return (
              <div className="space-y-4 mb-6">
                {Object.entries(grouped).map(([address, listsForAddress]) => (
                  <div key={address}>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <MapPin size={12} />{address}
                    </div>
                    <div className="space-y-2">
                      {listsForAddress.map(l => {
                        const itemCount = (l as any).items?.[0]?.count ?? 0
                        const isExpanded = expandedList === l.id
                        const expandedItems = listItems[l.id] || []
                        const fulfilledCount = expandedItems.filter((i: any) => i.fulfilled).length
                        const STATUS_COLORS: Record<string, string> = {
                          draft: 'bg-gray-100 text-gray-700',
                          ready: 'bg-blue-100 text-blue-700',
                          in_progress: 'bg-amber-100 text-amber-700',
                          completed: 'bg-green-100 text-green-700',
                          cancelled: 'bg-red-100 text-red-700',
                        }
                        return (
                          <div key={l.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => expandList(l.id)}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <span className="font-bold text-gray-900 text-sm">{l.name}</span>
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status] || 'bg-gray-100 text-gray-600'}`}>{l.status.replace('_', ' ')}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{itemCount} items</span>
                                  {isExpanded && expandedItems.length > 0 && (
                                    <span className="text-xs text-gray-500">{fulfilledCount}/{expandedItems.length} ready</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                                  {l.customer_name && <span>{l.customer_name}</span>}
                                  {l.service_type && <span>{l.service_type}</span>}
                                  {l.scheduled_date && <span>📅 {new Date(l.scheduled_date + 'T00:00:00').toLocaleDateString()}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button onClick={() => deleteList(l.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                                {isExpanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                                {expandedItems.length === 0 ? (
                                  <p className="text-xs text-gray-500 mb-3">No items on this list yet. Add inventory items below.</p>
                                ) : (
                                  <div className="space-y-1 mb-3">
                                    {expandedItems.map((it: any) => (
                                      <div key={it.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg text-sm">
                                        <input type="checkbox" checked={!!it.fulfilled} onChange={e => toggleItemFulfilled(l.id, it.id, e.target.checked)}
                                          className="cursor-pointer" />
                                        <div className="flex-1">
                                          <div className={`font-semibold text-sm ${it.fulfilled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{it.item_name}</div>
                                          <div className="text-xs text-gray-500">
                                            <span className="font-bold">{it.quantity_needed}</span> {it.unit}
                                            {it.unit_cost ? ` · $${Number(it.unit_cost).toFixed(2)} ea` : ''}
                                            {it.supplier ? ` · ${it.supplier}` : ''}
                                            {it.inventory_item?.quantity_on_hand !== undefined && ` · ${it.inventory_item.quantity_on_hand} on hand`}
                                          </div>
                                        </div>
                                        <button onClick={() => deleteListItem(l.id, it.id)}
                                          className="p-1 text-gray-400 hover:text-red-600"><X size={13} /></button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Add item to list */}
                                <div className="flex gap-2">
                                  <select value={newItemFor === l.id ? newItemId : ''} onChange={e => { setNewItemFor(l.id); setNewItemId(e.target.value) }}
                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                    <option value="">— select inventory item —</option>
                                    {items.map(it => (
                                      <option key={it.id} value={it.id}>{it.name} ({CATEGORIES[it.category]?.label || it.category})</option>
                                    ))}
                                  </select>
                                  <input type="number" min="0.01" step="0.01" value={newItemFor === l.id ? newItemQty : '1'}
                                    onChange={e => { setNewItemFor(l.id); setNewItemQty(e.target.value) }}
                                    className="w-20 px-2 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Qty" />
                                  <button onClick={() => addItemToList(l.id)} disabled={newItemFor !== l.id || !newItemId}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50">Add</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

        </div>
      )}

      {/* New Materials List modal */}
      {showNewList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-extrabold text-gray-900">New Materials List</h3>
              <button onClick={() => { setShowNewList(false); setNewListForm({ status: 'draft' }) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">List Name *</label>
                <input value={newListForm.name || ''} onChange={e => setNewListForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" placeholder='e.g. "Smith retrofit – kitchen"' />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Worksite</label>
                <select value={newListForm.worksite_id || ''}
                  onChange={e => {
                    const w = worksiteOptions.find((x: any) => x.id === e.target.value)
                    const addr = w?.address || ''
                    setNewListForm(p => ({
                      ...p,
                      worksite_id: e.target.value || null,
                      property_address: addr || p.property_address || '',
                      // Auto-fill list name with the address if name is empty or
                      // matched a previous worksite's address.
                      name: !p.name || worksiteOptions.some((x: any) => x.address === p.name)
                        ? addr || p.name
                        : p.name,
                    }))
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
                  <option value="">— optional, link to a worksite —</option>
                  {worksiteOptions.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.address}{w.city ? `, ${w.city}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Property Address {newListForm.worksite_id ? '(auto-filled)' : ''}</label>
                <input value={newListForm.property_address || ''}
                  onChange={e => setNewListForm(p => ({
                    ...p,
                    property_address: e.target.value,
                    // Mirror address into the list name if the name is empty or
                    // still matches the previous address (so it stays in sync).
                    name: !p.name || p.name === p.property_address ? e.target.value : p.name,
                  }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" placeholder="If no worksite selected, type the address" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Customer Name</label>
                <input value={newListForm.customer_name || ''} onChange={e => setNewListForm(p => ({ ...p, customer_name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Service Type</label>
                <input value={newListForm.service_type || ''} onChange={e => setNewListForm(p => ({ ...p, service_type: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" placeholder="e.g. Gas line install" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Scheduled Date</label>
                <input type="date" value={newListForm.scheduled_date || ''} onChange={e => setNewListForm(p => ({ ...p, scheduled_date: e.target.value || null }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Status</label>
                <select value={newListForm.status || 'draft'} onChange={e => setNewListForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
                  <option value="draft">Draft</option>
                  <option value="ready">Ready to start</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
                <textarea value={newListForm.notes || ''} onChange={e => setNewListForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setShowNewList(false); setNewListForm({ status: 'draft' }) }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={createList} disabled={savingList || !newListForm.name}
                className="px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#b8895a' }}>
                {savingList ? 'Creating…' : 'Create List'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUPPLIERS TAB ──────────────────────────────────────── */}
      {tab === 'suppliers' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">Suppliers</h2>
              <p className="text-sm text-gray-500">Companies you regularly order inventory from. Click a supplier to see what's assigned.</p>
            </div>
            <button onClick={() => { setEditSupplier(null); setSupplierForm({}); setShowAddSupplier(true) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm" style={{ background: '#b8895a' }}>
              <Plus size={14} />Add Supplier
            </button>
          </div>

          {suppliersLoading ? (
            <div className="flex justify-center py-12"><RefreshCw size={24} className="animate-spin text-gray-400" /></div>
          ) : suppliers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Home size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-semibold text-gray-700 mb-1">No suppliers yet</p>
              <p className="text-xs text-gray-500">Add the companies you regularly order from (Ferguson, SupplyHouse, Home Depot, etc.) so you can track which inventory comes from where.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.map(s => {
                const itemCount = (s as any).items?.[0]?.count ?? 0
                const isExpanded = expandedSupplier === s.id
                const assignedItems = supplierItems[s.id] || []
                const assignedIds = new Set(assignedItems.map((it: any) => it.id))
                const availableItems = items.filter(it => !assignedIds.has(it.id))
                return (
                  <div key={s.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 cursor-pointer" onClick={() => expandSupplier(s.id)}>
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 font-extrabold">
                          {s.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900">{s.name}</div>
                          <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                            {s.contact_phone && <span>{s.contact_phone}</span>}
                            {s.contact_email && <span>{s.contact_email}</span>}
                            {s.account_number && <span>Acct #{s.account_number}</span>}
                          </div>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">{itemCount} items</span>
                      </div>
                      <div className="flex items-center gap-1 ml-3" onClick={e => e.stopPropagation()}>
                        {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100" title="Website">↗</a>}
                        <button onClick={() => { setEditSupplier(s); setSupplierForm(s); setShowAddSupplier(true) }}
                          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><Edit3 size={14} /></button>
                        <button onClick={() => deleteSupplier(s.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={14} /></button>
                        {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                        {s.notes && <p className="text-xs text-gray-600 italic mb-3">{s.notes}</p>}
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Items ordered from {s.name}</div>
                        {assignedItems.length === 0 ? (
                          <p className="text-xs text-gray-500 mb-3">No items assigned. Use the dropdown below to add inventory items.</p>
                        ) : (
                          <div className="space-y-1 mb-3">
                            {assignedItems.map((it: any) => (
                              <div key={it.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg text-sm">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-800">{it.name}</div>
                                  <div className="text-xs text-gray-500">
                                    <CategoryBadge cat={it.category} /> · {it.quantity_on_hand} {it.unit} on hand
                                    {it.unit_cost ? ` · $${Number(it.unit_cost).toFixed(2)}` : ''}
                                  </div>
                                </div>
                                <button onClick={() => assignItemToSupplier(it.id, null)}
                                  className="p-1 text-gray-400 hover:text-red-600" title="Unassign">
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div>
                          <label className="text-xs font-semibold text-gray-600 mb-1 block">Assign an inventory item:</label>
                          <select onChange={e => { if (e.target.value) { assignItemToSupplier(e.target.value, s.id); e.target.value = '' } }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                            defaultValue="">
                            <option value="">— select an item to assign —</option>
                            {availableItems.map(it => (
                              <option key={it.id} value={it.id}>{it.name} ({CATEGORIES[it.category]?.label || it.category})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit supplier modal */}
      {showAddSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-extrabold text-gray-900">{editSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
              <button onClick={() => { setShowAddSupplier(false); setEditSupplier(null); setSupplierForm({}) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Name *</label>
                <input value={supplierForm.name || ''} onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" placeholder="e.g. Ferguson Plumbing" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Contact Name</label>
                <input value={supplierForm.contact_name || ''} onChange={e => setSupplierForm(p => ({ ...p, contact_name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Account Number</label>
                <input value={supplierForm.account_number || ''} onChange={e => setSupplierForm(p => ({ ...p, account_number: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Phone</label>
                <input value={supplierForm.contact_phone || ''} onChange={e => setSupplierForm(p => ({ ...p, contact_phone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Email</label>
                <input value={supplierForm.contact_email || ''} onChange={e => setSupplierForm(p => ({ ...p, contact_email: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Website</label>
                <input value={supplierForm.website || ''} onChange={e => setSupplierForm(p => ({ ...p, website: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" placeholder="https://" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Address</label>
                <input value={supplierForm.address || ''} onChange={e => setSupplierForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
                <textarea value={supplierForm.notes || ''} onChange={e => setSupplierForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setShowAddSupplier(false); setEditSupplier(null); setSupplierForm({}) }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={saveSupplier} disabled={savingSupplier || !supplierForm.name}
                className="px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#b8895a' }}>
                {savingSupplier ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────── */}
      {showAdd && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadInventory() }}
        />
      )}
      {editItem && (
        <AddItemModal
          editItem={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); loadInventory() }}
        />
      )}
      {showAdjust && (
        <AdjustStockModal
          item={showAdjust}
          onClose={() => setShowAdjust(null)}
          onSaved={() => { setShowAdjust(null); loadInventory() }}
        />
      )}
      {showCatalog && (
        <CatalogModal
          onClose={() => setShowCatalog(false)}
          onImported={() => { setShowCatalog(false); loadInventory() }}
        />
      )}
      {priceSearchItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-purple-600" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">AI Price Search</h2>
                  <p className="text-xs text-gray-500">{priceSearchItem.name}</p>
                </div>
              </div>
              <button onClick={() => { setPriceSearchItem(null); setPriceSearchResults(null); setPriceSearchError('') }}>
                <X size={18} className="text-gray-400 hover:text-gray-700" />
              </button>
            </div>
            <div className="p-6">
              {priceSearchLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <RefreshCw size={28} className="animate-spin text-purple-600" />
                  <p className="text-sm font-semibold text-gray-700">Searching retailers…</p>
                  <p className="text-xs text-gray-500">This usually takes 20-40 seconds. Looking at the major suppliers (Home Depot, Lowe's, Ferguson, SupplyHouse, Amazon, etc.).</p>
                </div>
              )}
              {priceSearchError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{priceSearchError}</div>
              )}
              {priceSearchResults && !priceSearchLoading && (
                <div className="space-y-4">
                  {priceSearchResults.search_summary && (
                    <p className="text-sm text-gray-600 italic">{priceSearchResults.search_summary}</p>
                  )}
                  {Array.isArray(priceSearchResults.results) && priceSearchResults.results.length > 0 ? (
                    <>
                      <div className="overflow-hidden rounded-xl border border-gray-100">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500">Supplier</th>
                              <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500">Product</th>
                              <th className="px-3 py-2 text-right text-xs font-bold uppercase text-gray-500">Price</th>
                              <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500">Stock</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {priceSearchResults.results.map((r: any, i: number) => {
                              const isCheapest = i === 0
                              return (
                                <tr key={i} className={`border-t border-gray-100 ${isCheapest ? 'bg-green-50' : ''}`}>
                                  <td className="px-3 py-3 font-semibold text-gray-900">
                                    {isCheapest && <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-200 text-green-800 mr-1.5">CHEAPEST</span>}
                                    {r.supplier}
                                  </td>
                                  <td className="px-3 py-3 text-gray-600">
                                    <div className="font-medium text-gray-800">{r.product_name}</div>
                                    {r.notes && <div className="text-xs text-gray-500 mt-0.5">{r.notes}</div>}
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    <div className={`font-bold ${isCheapest ? 'text-green-700' : 'text-gray-900'}`}>${Number(r.price).toFixed(2)}</div>
                                    <div className="text-xs text-gray-500">{r.unit}</div>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {r.in_stock === false ? <span className="text-red-600 text-xs font-semibold">Out</span> : <span className="text-green-600 text-xs font-semibold">In stock</span>}
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    {r.url && (
                                      <a href={r.url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100">
                                        Buy ↗
                                      </a>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {priceSearchResults.cheapest_price && (
                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
                          <div>
                            <div className="text-xs font-bold text-green-800 uppercase">Best price found</div>
                            <div className="text-2xl font-extrabold text-green-700">${Number(priceSearchResults.cheapest_price).toFixed(2)}</div>
                            <div className="text-sm text-green-600">{priceSearchResults.cheapest_supplier}</div>
                          </div>
                          <button onClick={applyCheapestPrice}
                            className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700">
                            Save as Unit Cost
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 py-8 text-center">No price results returned. Try editing the item name to be more specific (add brand, size, model number).</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Property Materials grouped by address/property ─────────────
function PropertyMaterialsGrouped({
  materials, onDelete,
}: { materials: PropertyMaterial[]; onDelete: (id: string) => void }) {
  // Group by property address or customer name
  const grouped: Record<string, PropertyMaterial[]> = {}
  for (const m of materials) {
    const key = m.property_address ||
      (m.contact ? `${m.contact.first_name} ${m.contact.last_name}` : null) ||
      (m.worksite ? m.worksite.address : null) ||
      'Unknown Property'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  }

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([address, mats]) => (
        <div key={address} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <MapPin size={15} className="text-blue-500 flex-shrink-0" />
            <span className="font-semibold text-gray-800 text-sm">{address}</span>
            <span className="ml-auto text-xs text-gray-400">{mats.length} items</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Item</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500">Qty</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Source</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Date</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {mats.map((m, idx) => (
                <tr key={m.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 ${idx === mats.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{m.item_name}</div>
                    <CategoryBadge cat={m.category} />
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-700 font-medium">
                    {m.quantity} {m.unit}
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {m.source === 'invoice' ? (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <ClipboardList size={13} />
                        {m.invoice ? `#${m.invoice.invoice_number}` : 'Invoice'}
                      </span>
                    ) : m.source === 'calendar' ? (
                      <span className="text-xs text-purple-600 flex items-center gap-1">
                        <Clock size={13} /> Calendar
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Manual</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs hidden md:table-cell">
                    {m.date_used ? new Date(m.date_used + 'T12:00:00').toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => onDelete(m.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Add / Edit item modal ──────────────────────────────────────
function AddItemModal({
  editItem, onClose, onSaved,
}: {
  editItem?: InventoryItem
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: editItem?.name || '',
    description: editItem?.description || '',
    sku: editItem?.sku || '',
    category: editItem?.category || 'other',
    unit: editItem?.unit || 'each',
    quantity_on_hand: editItem?.quantity_on_hand ?? 0,
    reorder_point: editItem?.reorder_point ?? 0,
    reorder_quantity: editItem?.reorder_quantity ?? 0,
    unit_cost: editItem?.unit_cost ?? '',
    supplier: editItem?.supplier || '',
    gas_type: editItem?.gas_type || 'both',
    notes: editItem?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!form.name.trim()) return setErr('Name is required')
    setSaving(true)
    setErr('')
    const body = {
      ...form,
      unit_cost: form.unit_cost !== '' ? Number(form.unit_cost) : null,
      quantity_on_hand: Number(form.quantity_on_hand),
      reorder_point: Number(form.reorder_point),
      reorder_quantity: Number(form.reorder_quantity),
    }
    if (editItem?.id) {
      await fetch('/api/inventory', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editItem.id, ...body }),
      })
    } else {
      await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    setSaving(false)
    onSaved()
  }

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {editItem ? 'Edit Item' : 'Add Inventory Item'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">{err}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <input value={form.name} onChange={f('name')} placeholder={'e.g. Ball Valve 1/2"'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={f('category')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gas Type</label>
              <select value={form.gas_type} onChange={f('gas_type')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {GAS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.unit} onChange={f('unit')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
              <input type="number" step="0.01" min="0" value={form.unit_cost} onChange={f('unit_cost')}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">In Stock</label>
              <input type="number" min="0" step="0.5" value={form.quantity_on_hand} onChange={f('quantity_on_hand')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder At</label>
              <input type="number" min="0" step="1" value={form.reorder_point} onChange={f('reorder_point')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Qty</label>
              <input type="number" min="0" step="1" value={form.reorder_quantity} onChange={f('reorder_quantity')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU / Part #</label>
              <input value={form.sku} onChange={f('sku')} placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <input value={form.supplier} onChange={f('supplier')} placeholder="e.g. Ferguson, Ferrellgas"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Optional notes…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5">
            {saving && <RefreshCw size={14} className="animate-spin" />}
            {editItem ? 'Save Changes' : 'Add to Inventory'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Adjust stock modal ─────────────────────────────────────────
function AdjustStockModal({
  item, onClose, onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const delta = mode === 'add' ? Number(qty) : -Number(qty)
  const newQty = Math.max(0, item.quantity_on_hand + delta)

  async function save() {
    if (!qty || Number(qty) <= 0) return
    setSaving(true)
    await fetch('/api/inventory?action=adjust', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        delta,
        transaction_type: mode === 'add' ? 'received' : 'used',
        notes: note || null,
      }),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Adjust Stock</h2>
            <p className="text-sm text-gray-500">{item.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button onClick={() => setMode('add')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                mode === 'add' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <ArrowUpCircle size={16} /> Add Stock
            </button>
            <button onClick={() => setMode('remove')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                mode === 'remove' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <ArrowDownCircle size={16} /> Use / Remove
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity ({item.unit})
            </label>
            <input type="number" min="0.5" step="0.5" value={qty} onChange={e => setQty(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-4 py-3">
            <span className="text-gray-600">Current: <strong>{item.quantity_on_hand} {item.unit}</strong></span>
            <span className="text-gray-400">→</span>
            <span className={`font-semibold ${newQty === 0 ? 'text-red-600' : newQty <= item.reorder_point && item.reorder_point > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {newQty} {item.unit}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Used at 123 Main St, Received from Ferguson"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving || !qty || Number(qty) <= 0}
            className={`px-4 py-2 text-sm rounded-lg text-white flex items-center gap-1.5 ${
              mode === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {saving && <RefreshCw size={14} className="animate-spin" />}
            {mode === 'add' ? 'Add to Stock' : 'Remove from Stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Catalog import modal ───────────────────────────────────────
function CatalogModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [catFilter, setCatFilter] = useState('all')
  const [gasFilter, setGasFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/inventory?action=catalog').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setCatalog(d)
    })
  }, [])

  const filtered = catalog.filter((item, _idx) => {
    if (catFilter !== 'all' && item.category !== catFilter) return false
    if (gasFilter !== 'all' && item.gas_type !== gasFilter && item.gas_type !== 'both') return false
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const allSelected = filtered.length > 0 && filtered.every((_, i) => selected.has(catalog.indexOf(_)))
  function toggleAll() {
    if (allSelected) {
      setSelected(s => { const n = new Set(s); filtered.forEach(item => n.delete(catalog.indexOf(item))); return n })
    } else {
      setSelected(s => { const n = new Set(s); filtered.forEach(item => n.add(catalog.indexOf(item))); return n })
    }
  }

  async function doImport() {
    setImporting(true)
    const items = Array.from(selected).map(i => catalog[i]).filter(Boolean)
    const res = await fetch('/api/inventory?action=bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const data = await res.json()
    setImported(data.imported || items.length)
    setImporting(false)
    setTimeout(() => onImported(), 1200)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles size={20} className="text-purple-600" /> Import from Industry Catalog
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Pre-built catalog for natural gas &amp; LP service companies</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 px-6 py-3 border-b bg-gray-50/60 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Categories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={gasFilter} onChange={e => setGasFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">NG &amp; LP</option>
            <option value="natural_gas">Natural Gas</option>
            <option value="propane">Propane / LP</option>
          </select>
          <button onClick={toggleAll}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600">
            {allSelected ? 'Deselect All' : `Select All (${filtered.length})`}
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-6 py-2">
          {filtered.map((item) => {
            const idx = catalog.indexOf(item)
            const checked = selected.has(idx)
            return (
              <label key={idx} className="flex items-center gap-3 py-2.5 border-b border-gray-50 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                <input type="checkbox" checked={checked}
                  onChange={() => setSelected(s => { const n = new Set(s); checked ? n.delete(idx) : n.add(idx); return n })}
                  className="w-4 h-4 rounded text-blue-600 border-gray-300" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                  <div className="flex gap-2 mt-0.5">
                    <CategoryBadge cat={item.category} />
                    <span className="text-xs text-gray-400">per {item.unit}</span>
                  </div>
                </div>
                <GasTypeBadge t={item.gas_type} />
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 flex-shrink-0">
          <span className="text-sm text-gray-600">
            {selected.size} item{selected.size !== 1 ? 's' : ''} selected
          </span>
          {imported !== null && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 size={16} /> {imported} items imported!
            </span>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Cancel</button>
            <button onClick={doImport} disabled={importing || selected.size === 0}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1.5 disabled:opacity-50">
              {importing && <RefreshCw size={14} className="animate-spin" />}
              <Download size={14} /> Import {selected.size > 0 ? selected.size : ''} Items
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
