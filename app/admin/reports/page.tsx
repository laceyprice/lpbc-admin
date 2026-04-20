'use client'
import { useEffect, useState } from 'react'
import { Loader2, TrendingUp, TrendingDown, DollarSign, Scale, ArrowRightLeft, Download, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'

type Tab = 'pnl' | 'balance-sheet' | 'cash-flow' | 'reconciliation'

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('pnl')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(0, 1)
    return d.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => { load() }, [tab, from, to])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: tab, from, to, year: from.substring(0, 4) })
      const res = await fetch(`/api/reports?${params}`)
      setData(await res.json())
    } catch { setData(null) }
    setLoading(false)
  }

  const tabs: { k: Tab; l: string }[] = [
    { k: 'pnl', l: 'Profit & Loss' },
    { k: 'balance-sheet', l: 'Balance Sheet' },
    { k: 'cash-flow', l: 'Cash Flow' },
    { k: 'reconciliation', l: 'Reconciliation' },
  ]

  const inputCls = 'px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  async function downloadPDF() {
    if (!data) return
    const { default: jsPDF } = await import('jspdf')
    await import('jspdf-autotable')
    const tabLabels: Record<Tab, string> = { pnl: 'Profit & Loss', 'balance-sheet': 'Balance Sheet', 'cash-flow': 'Cash Flow Statement', reconciliation: 'Reconciliation Report' }
    const doc = new jsPDF('p', 'pt', 'letter') as any
    const pageW = doc.internal.pageSize.getWidth()

    // ── Branded Header ──
    const headerH = 60
    doc.setFillColor(47, 90, 94) // #2f5a5e
    doc.rect(0, 0, pageW, headerH, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('L. Price Building Company', 40, 28)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Lacey@LaceyNPrice.com', 40, 44)

    // ── Report Title & Date Range ──
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(tabLabels[tab], 40, headerH + 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Period: ${from} to ${to}`, 40, headerH + 46)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 40, headerH + 60)

    let curY = headerH + 80

    const brand = [47, 90, 94] as [number, number, number]
    const headStyles = { fillColor: brand, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, fontSize: 9 }
    const bodyStyles = { fontSize: 9 }
    const footStyles = { fillColor: [243, 237, 227] as [number, number, number], textColor: brand, fontStyle: 'bold' as const, fontSize: 9 }

    if (tab === 'pnl') {
      // Revenue
      curY = addSectionLabel(doc, 'REVENUE', curY, pageW)
      doc.autoTable({
        startY: curY,
        head: [['Account', 'Amount']],
        body: [...(data.revenue || []).map((l: any) => [l.name, fmtMoney(l.total)]),
          ...(data.uncategorized?.revenue > 0 ? [['Uncategorized', fmtMoney(data.uncategorized.revenue)]] : [])],
        foot: [['Total Revenue', fmtMoney(data.totalRevenue ?? 0)]],
        headStyles, bodyStyles, footStyles,
        margin: { left: 40, right: 40 },
        columnStyles: { 1: { halign: 'right' } },
      })
      curY = doc.lastAutoTable.finalY + 20

      // Expenses
      curY = addSectionLabel(doc, 'EXPENSES', curY, pageW)
      doc.autoTable({
        startY: curY,
        head: [['Account', 'Amount']],
        body: [...(data.expenses || []).map((l: any) => [l.name, fmtMoney(l.total)]),
          ...(data.uncategorized?.expense > 0 ? [['Uncategorized', fmtMoney(data.uncategorized.expense)]] : [])],
        foot: [['Total Expenses', fmtMoney(data.totalExpenses ?? 0)]],
        headStyles, bodyStyles, footStyles,
        margin: { left: 40, right: 40 },
        columnStyles: { 1: { halign: 'right' } },
      })
      curY = doc.lastAutoTable.finalY + 20

      // Distributions
      if ((data.distributions || []).length > 0) {
        curY = addSectionLabel(doc, 'OWNER DISTRIBUTIONS', curY, pageW)
        doc.autoTable({
          startY: curY,
          head: [['Account', 'Amount']],
          body: (data.distributions || []).map((l: any) => [l.name, fmtMoney(l.total)]),
          foot: [['Total Distributions', fmtMoney(data.totalDistributions ?? 0)]],
          headStyles, bodyStyles, footStyles,
          margin: { left: 40, right: 40 },
          columnStyles: { 1: { halign: 'right' } },
        })
        curY = doc.lastAutoTable.finalY + 20
      }

      // Net Income
      curY = addSectionLabel(doc, 'SUMMARY', curY, pageW)
      doc.autoTable({
        startY: curY,
        body: [
          ['Total Revenue', fmtMoney(data.totalRevenue ?? 0)],
          ['Total Expenses', fmtMoney(data.totalExpenses ?? 0)],
          ...((data.totalDistributions ?? 0) > 0 ? [['Total Distributions', fmtMoney(data.totalDistributions)]] : []),
        ],
        foot: [['NET INCOME', fmtMoney(data.netIncome ?? 0)]],
        headStyles, bodyStyles,
        footStyles: { ...footStyles, fontSize: 11 },
        margin: { left: 40, right: 40 },
        columnStyles: { 1: { halign: 'right' } },
      })
    }

    if (tab === 'balance-sheet') {
      for (const [label, key] of [['ASSETS', 'assets'], ['LIABILITIES', 'liabilities'], ['EQUITY', 'equity']] as const) {
        curY = addSectionLabel(doc, label, curY, pageW)
        const lines = (data[key] || []).map((l: any) => [l.name, fmtMoney(l.opening), fmtMoney(l.activity), fmtMoney(l.balance)])
        if (key === 'equity') lines.push(['Net Income (Current Period)', '—', '—', fmtMoney(data.netIncome ?? 0)])
        const totalVal = key === 'equity' ? (data.totalEquity ?? 0) + (data.netIncome ?? 0) : (data[`total${label.charAt(0) + label.slice(1).toLowerCase()}`] ?? 0)
        doc.autoTable({
          startY: curY,
          head: [['Account', 'Opening', 'Activity', 'Balance']],
          body: lines,
          foot: [[`Total ${label}`, '', '', fmtMoney(totalVal)]],
          headStyles, bodyStyles, footStyles,
          margin: { left: 40, right: 40 },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        })
        curY = doc.lastAutoTable.finalY + 20
      }

      doc.autoTable({
        startY: curY,
        body: [
          ['Total Assets', fmtMoney(data.totalAssets ?? 0)],
          ['Total Liabilities & Equity', fmtMoney(data.totalLiabilitiesAndEquity ?? 0)],
        ],
        foot: [['Difference', fmtMoney(Math.abs((data.totalAssets ?? 0) - (data.totalLiabilitiesAndEquity ?? 0)))]],
        headStyles, bodyStyles, footStyles: { ...footStyles, fontSize: 11 },
        margin: { left: 40, right: 40 },
        columnStyles: { 1: { halign: 'right' } },
      })
    }

    if (tab === 'cash-flow') {
      curY = addSectionLabel(doc, 'MONTHLY CASH FLOW', curY, pageW)
      doc.autoTable({
        startY: curY,
        head: [['Month', 'Inflows', 'Outflows', 'Net']],
        body: (data.monthly || []).map((m: any) => [m.month, fmtMoney(m.inflows), fmtMoney(m.outflows), fmtMoney(m.net)]),
        foot: [['TOTAL', fmtMoney(data.totalInflows ?? 0), fmtMoney(data.totalOutflows ?? 0), fmtMoney(data.netCashFlow ?? 0)]],
        headStyles, bodyStyles, footStyles,
        margin: { left: 40, right: 40 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
      curY = doc.lastAutoTable.finalY + 20

      if ((data.byAccount || []).length > 0) {
        curY = addSectionLabel(doc, 'CASH FLOW BY ACCOUNT', curY, pageW)
        doc.autoTable({
          startY: curY,
          head: [['Account', 'Type', 'Net Amount']],
          body: (data.byAccount || []).map((a: any) => [a.name, a.type, fmtMoney(a.total)]),
          headStyles, bodyStyles,
          margin: { left: 40, right: 40 },
          columnStyles: { 2: { halign: 'right' } },
        })
      }
    }

    if (tab === 'reconciliation') {
      curY = addSectionLabel(doc, 'RECONCILIATION SUMMARY', curY, pageW)
      doc.autoTable({
        startY: curY,
        head: [['Metric', 'Value']],
        body: [
          ['Bank Transactions', String(data.bankTransactionCount ?? 0)],
          ['Accounting Entries', String(data.accountingEntryCount ?? 0)],
          ['Reconciled', String(data.reconciledCount ?? 0)],
          ['Unreconciled', String(data.unreconciledCount ?? 0)],
          ['Uncategorized', String(data.uncategorizedCount ?? 0)],
          ['Bank Total', fmtMoney(data.bankTotal ?? 0)],
          ['Accounting Total', fmtMoney(data.accountingTotal ?? 0)],
        ],
        foot: [['Difference', fmtMoney(data.difference ?? 0)]],
        headStyles, bodyStyles, footStyles,
        margin: { left: 40, right: 40 },
        columnStyles: { 1: { halign: 'right' } },
      })
      curY = doc.lastAutoTable.finalY + 20

      if ((data.unreconciled || []).length > 0) {
        curY = addSectionLabel(doc, `UNRECONCILED TRANSACTIONS (${data.unreconciledCount})`, curY, pageW)
        doc.autoTable({
          startY: curY,
          head: [['Date', 'Description', 'Payee', 'Amount']],
          body: (data.unreconciled || []).map((tx: any) => [tx.transaction_date, tx.description, tx.payee || '—', fmtMoney(tx.amount)]),
          headStyles, bodyStyles,
          margin: { left: 40, right: 40 },
          columnStyles: { 3: { halign: 'right' } },
        })
        curY = doc.lastAutoTable.finalY + 20
      }

      if ((data.uncategorized || []).length > 0) {
        curY = addSectionLabel(doc, `UNCATEGORIZED TRANSACTIONS (${data.uncategorizedCount})`, curY, pageW)
        doc.autoTable({
          startY: curY,
          head: [['Date', 'Description', 'Payee', 'Amount']],
          body: (data.uncategorized || []).map((tx: any) => [tx.transaction_date, tx.description, tx.payee || '—', fmtMoney(tx.amount)]),
          headStyles, bodyStyles,
          margin: { left: 40, right: 40 },
          columnStyles: { 3: { halign: 'right' } },
        })
      }
    }

    // Footer on every page
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      const pageH = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text('L. Price Building Company — Confidential', 40, pageH - 20)
      doc.text(`Page ${i} of ${pageCount}`, pageW - 40, pageH - 20, { align: 'right' })
    }

    const filename = `${tabLabels[tab].replace(/ /g, '_')}_${from}_to_${to}.pdf`
    doc.save(filename)
  }

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Financial Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">P&amp;L · Balance Sheet · Cash Flow · Reconciliation</p>
        </div>
        {data && !data.error && (
          <button onClick={downloadPDF} className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#b8895a' }}>
            <Download size={14} />Download PDF
          </button>
        )}
      </div>

      {/* Date Range */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="text-sm font-semibold text-gray-600">From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        <label className="text-sm font-semibold text-gray-600">To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {tabs.map(({ k, l }) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            style={{ color: tab === k ? '#b8895a' : undefined }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#b8895a' }} /></div>
      ) : !data || data.error ? (
        <div className="text-center py-20 text-gray-400">
          <AlertTriangle size={30} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">{data?.error || 'Failed to load report'}</p>
        </div>
      ) : (
        <>
          {tab === 'pnl' && <PnLReport data={data} />}
          {tab === 'balance-sheet' && <BalanceSheetReport data={data} />}
          {tab === 'cash-flow' && <CashFlowReport data={data} />}
          {tab === 'reconciliation' && <ReconciliationReport data={data} />}
        </>
      )}
    </div>
  )
}

// ─── P&L ────────────────────────────────────────────────────
function PnLReport({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard icon={TrendingUp} label="Revenue" value={data.totalRevenue} color="green" />
        <SummaryCard icon={TrendingDown} label="Expenses" value={data.totalExpenses} color="red" />
        <SummaryCard icon={DollarSign} label="Distributions" value={data.totalDistributions} color="orange" />
        <SummaryCard icon={DollarSign} label="Net Income" value={data.netIncome} color={data.netIncome >= 0 ? 'blue' : 'red'} />
      </div>

      {/* Revenue */}
      <ReportSection title="REVENUE" lines={data.revenue} totalLabel="Total Revenue" total={data.totalRevenue} color="green" />

      {/* Expenses */}
      <ReportSection title="EXPENSES" lines={data.expenses} totalLabel="Total Expenses" total={data.totalExpenses} color="red" />

      {/* Distributions */}
      {(data.distributions || []).length > 0 && (
        <ReportSection title="OWNER DISTRIBUTIONS" lines={data.distributions} totalLabel="Total Distributions" total={data.totalDistributions} color="orange" />
      )}

      {/* Uncategorized */}
      {(data.uncategorized?.revenue > 0 || data.uncategorized?.expense > 0) && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3">Uncategorized Transactions</h3>
          <div className="flex gap-8 text-sm">
            <div><span className="text-gray-600">Revenue:</span> <span className="font-bold text-green-700">{formatCurrency(data.uncategorized.revenue)}</span></div>
            <div><span className="text-gray-600">Expenses:</span> <span className="font-bold text-red-600">{formatCurrency(data.uncategorized.expense)}</span></div>
          </div>
        </div>
      )}

      {/* Net Income */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-gray-900">Net Income</span>
          <span className={`text-2xl font-extrabold ${data.netIncome >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatCurrency(data.netIncome)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── BALANCE SHEET ──────────────────────────────────────────
function BalanceSheetReport({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon={DollarSign} label="Total Assets" value={data.totalAssets} color="blue" />
        <SummaryCard icon={Scale} label="Total Liabilities" value={data.totalLiabilities} color="red" />
        <SummaryCard icon={DollarSign} label="Total Equity" value={data.totalEquity + data.netIncome} color="green" />
      </div>

      <BalanceSection title="ASSETS" lines={data.assets} total={data.totalAssets} />
      <BalanceSection title="LIABILITIES" lines={data.liabilities} total={data.totalLiabilities} />
      <BalanceSection title="EQUITY" lines={data.equity} total={data.totalEquity} extraLine={{ name: 'Net Income (Current Period)', balance: data.netIncome }} />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-gray-900">Total Liabilities &amp; Equity</span>
          <span className="text-2xl font-extrabold" style={{ color: '#b8895a' }}>{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
        </div>
        {Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) > 0.01 && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <AlertTriangle size={12} /> Assets and Liabilities+Equity do not balance (difference: {formatCurrency(Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity))})
          </p>
        )}
      </div>
    </div>
  )
}

// ─── CASH FLOW ──────────────────────────────────────────────
function CashFlowReport({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon={TrendingUp} label="Total Inflows" value={data.totalInflows} color="green" />
        <SummaryCard icon={TrendingDown} label="Total Outflows" value={data.totalOutflows} color="red" />
        <SummaryCard icon={DollarSign} label="Net Cash Flow" value={data.netCashFlow} color={data.netCashFlow >= 0 ? 'blue' : 'red'} />
      </div>

      {/* Monthly breakdown */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Monthly Cash Flow</h3>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-100">
            {['Month', 'Inflows', 'Outflows', 'Net'].map(h => (
              <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {(data.monthly || []).length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">No transactions in this period</td></tr>
            ) : (data.monthly || []).map((m: any) => (
              <tr key={m.month} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{m.month}</td>
                <td className="px-5 py-3 text-green-700 font-bold">{formatCurrency(m.inflows)}</td>
                <td className="px-5 py-3 text-red-600 font-bold">{formatCurrency(m.outflows)}</td>
                <td className={`px-5 py-3 font-bold ${m.net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatCurrency(m.net)}</td>
              </tr>
            ))}
          </tbody>
          {(data.monthly || []).length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-5 py-3 font-extrabold text-gray-900">Total</td>
                <td className="px-5 py-3 font-extrabold text-green-700">{formatCurrency(data.totalInflows)}</td>
                <td className="px-5 py-3 font-extrabold text-red-600">{formatCurrency(data.totalOutflows)}</td>
                <td className={`px-5 py-3 font-extrabold ${data.netCashFlow >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatCurrency(data.netCashFlow)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* By Account */}
      {(data.byAccount || []).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Cash Flow by Account</h3>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['Account', 'Type', 'Net Amount'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {(data.byAccount || []).map((a: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 capitalize">{a.type}</span></td>
                  <td className={`px-5 py-3 font-bold ${a.total >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(a.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── RECONCILIATION ─────────────────────────────────────────
function ReconciliationReport({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Bank Transactions" value={data.bankTransactionCount} />
        <StatCard label="Accounting Entries" value={data.accountingEntryCount} />
        <StatCard label="Reconciled" value={data.reconciledCount} good />
        <StatCard label="Unreconciled" value={data.unreconciledCount} warn={data.unreconciledCount > 0} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon={DollarSign} label="Bank Total" value={data.bankTotal} color="blue" />
        <SummaryCard icon={DollarSign} label="Accounting Total" value={data.accountingTotal} color="blue" />
        <SummaryCard icon={ArrowRightLeft} label="Difference" value={data.difference} color={Math.abs(data.difference) < 0.01 ? 'green' : 'red'} />
      </div>

      {/* Uncategorized */}
      {(data.uncategorized || []).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
            <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider">Uncategorized Bank Transactions ({data.uncategorizedCount})</h3>
          </div>
          <TxTable rows={data.uncategorized} />
        </div>
      )}

      {/* Unreconciled */}
      {(data.unreconciled || []).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 bg-red-50">
            <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider">Unreconciled Bank Transactions ({data.unreconciledCount})</h3>
          </div>
          <TxTable rows={data.unreconciled} />
        </div>
      )}

      {data.unreconciledCount === 0 && data.uncategorizedCount === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ArrowRightLeft size={30} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">All transactions are reconciled and categorized</p>
        </div>
      )}
    </div>
  )
}

// ─── PDF HELPERS ────────────────────────────────────────────

function fmtMoney(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}

function addSectionLabel(doc: any, label: string, y: number, pageW: number): number {
  // Check if we need a new page
  if (y > doc.internal.pageSize.getHeight() - 100) {
    doc.addPage()
    y = 40
  }
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(24, 95, 165)
  doc.text(label, 40, y)
  return y + 6
}

// ─── SHARED COMPONENTS ──────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    green:  { bg: 'bg-green-50',  border: 'border-green-100',  text: 'text-green-700',  icon: 'text-green-600' },
    red:    { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-700',    icon: 'text-red-600' },
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700',   icon: 'text-blue-600' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', icon: 'text-orange-600' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={c.icon} />
        <span className={`text-xs font-bold uppercase tracking-wider ${c.text}`}>{label}</span>
      </div>
      <div className={`text-2xl font-extrabold ${c.text}`}>{formatCurrency(Math.abs(value))}</div>
    </div>
  )
}

function StatCard({ label, value, good, warn }: { label: string; value: number; good?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border ${warn ? 'bg-amber-50 border-amber-100' : good ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
      <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${warn ? 'text-amber-700' : good ? 'text-green-700' : 'text-gray-600'}`}>{label}</div>
      <div className={`text-2xl font-extrabold ${warn ? 'text-amber-700' : good ? 'text-green-700' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function ReportSection({ title, lines: rawLines, totalLabel, total, color }: { title: string; lines: any[]; totalLabel: string; total: number; color: string }) {
  const lines = rawLines || []
  const textColor = color === 'green' ? 'text-green-700' : color === 'red' ? 'text-red-600' : 'text-orange-700'
  const bgColor = color === 'green' ? 'bg-green-50' : color === 'red' ? 'bg-red-50' : 'bg-orange-50'
  const borderColor = color === 'green' ? 'border-green-100' : color === 'red' ? 'border-red-100' : 'border-orange-100'
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-50">
          {lines.length === 0 ? (
            <tr><td className="px-5 py-4 text-gray-400 text-sm">No entries</td></tr>
          ) : lines.map((l: any) => (
            <tr key={l.id} className="hover:bg-gray-50">
              <td className="px-5 py-3 text-gray-900">{l.name}</td>
              <td className={`px-5 py-3 text-right font-bold ${l.total > 0 ? textColor : 'text-gray-400'}`}>{formatCurrency(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={`${bgColor} border-t ${borderColor}`}>
            <td className={`px-5 py-3 font-extrabold ${textColor}`}>{totalLabel}</td>
            <td className={`px-5 py-3 text-right font-extrabold ${textColor}`}>{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function BalanceSection({ title, lines: rawLines, total, extraLine }: { title: string; lines: any[]; total: number; extraLine?: { name: string; balance: number } }) {
  const lines = rawLines || []
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 border-b border-gray-100">
          {['Account', 'Opening', 'Activity', 'Balance'].map(h => (
            <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider ${h !== 'Account' ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {lines.length === 0 && !extraLine ? (
            <tr><td colSpan={4} className="px-5 py-4 text-gray-400 text-sm">No entries</td></tr>
          ) : (
            <>
              {lines.map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-900">{l.name}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(l.opening)}</td>
                  <td className={`px-5 py-3 text-right font-medium ${l.activity >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(l.activity)}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(l.balance)}</td>
                </tr>
              ))}
              {extraLine && (
                <tr className="hover:bg-gray-50 bg-blue-50/30">
                  <td className="px-5 py-3 text-gray-900 italic">{extraLine.name}</td>
                  <td className="px-5 py-3 text-right text-gray-400">—</td>
                  <td className="px-5 py-3 text-right text-gray-400">—</td>
                  <td className={`px-5 py-3 text-right font-bold ${extraLine.balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(extraLine.balance)}</td>
                </tr>
              )}
            </>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t border-gray-200">
            <td className="px-5 py-3 font-extrabold text-gray-900">Total {title}</td>
            <td className="px-5 py-3" />
            <td className="px-5 py-3" />
            <td className="px-5 py-3 text-right font-extrabold" style={{ color: '#b8895a' }}>{formatCurrency(total + (extraLine?.balance || 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function TxTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="bg-gray-50 border-b border-gray-100">
        {['Date', 'Description', 'Payee', 'Amount'].map(h => (
          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
        ))}
      </tr></thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((tx: any) => (
          <tr key={tx.id} className="hover:bg-gray-50">
            <td className="px-5 py-3 text-gray-600 text-xs whitespace-nowrap">{formatDateShort(tx.transaction_date)}</td>
            <td className="px-5 py-3 text-gray-900 text-xs truncate max-w-48">{tx.description}</td>
            <td className="px-5 py-3 text-gray-600 text-xs">{tx.payee || '—'}</td>
            <td className={`px-5 py-3 font-bold text-sm ${tx.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(tx.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
