'use client'
import { useEffect, useRef, useState } from 'react'
import { Inbox, Send, FileText, Search, Mail, MailOpen, Paperclip, X, Loader2, Plus, Reply, Archive, Bold, Italic, Underline, Link as LinkIcon, Image as ImageIcon, Trash2, Settings, ExternalLink, RefreshCw, Save } from 'lucide-react'

interface ListMsg {
  id: string; threadId: string; from: string; to: string; subject: string;
  date: string; snippet: string; unread: boolean; hasAttachment: boolean
}
interface FullMsg extends ListMsg {
  cc?: string; html: string; text: string; labelIds: string[];
  attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[]
}

const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'all', label: 'All Mail', icon: Mail },
] as const

const SIG_KEY = 'gasologist_email_signature'
const DEFAULT_SIGNATURE = `<br><br>—<br><strong>Lacey Price</strong><br>L. Price Building Company<br><a href="tel:8505989128">850-598-9128</a><br><a href="mailto:Lacey@LaceyNPrice.com">Lacey@LaceyNPrice.com</a>`

export default function EmailPage() {
  return <EmailInbox />
}

export function EmailInbox({ embedded = false }: { embedded?: boolean } = {}) {
  const [folder, setFolder] = useState<typeof FOLDERS[number]['key']>('inbox')
  const [messages, setMessages] = useState<ListMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FullMsg | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeCc, setComposeCc] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeAttachments, setComposeAttachments] = useState<{ name: string; mimeType: string; base64: string; size: number }[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [signature, setSignature] = useState('')
  const composeBodyRef = useRef<HTMLDivElement>(null)
  const sigRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [replyContext, setReplyContext] = useState<{ inReplyTo: string; threadId: string } | null>(null)

  // Load signature from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    setSignature(localStorage.getItem(SIG_KEY) || DEFAULT_SIGNATURE)
  }, [])

  useEffect(() => { loadList() }, [folder])
  useEffect(() => {
    const t = setTimeout(loadList, search ? 400 : 0)
    return () => clearTimeout(t)
  }, [search])

  async function loadList() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ folder })
      if (search) params.set('q', search)
      const res = await fetch(`/api/email?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load')
      setMessages(d.messages || [])
    } catch (e: any) {
      setError(e.message)
      setMessages([])
    }
    setLoading(false)
  }

  async function openMessage(m: ListMsg) {
    setLoadingMsg(true)
    setSelected(null)
    try {
      const res = await fetch(`/api/email?id=${m.id}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      setSelected(d)
      // Mark read in background
      if (m.unread) {
        fetch('/api/email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, markRead: true }) })
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, unread: false } : x))
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoadingMsg(false)
  }

  async function archiveMessage(id: string) {
    await fetch('/api/email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, archive: true }) })
    setMessages(prev => prev.filter(x => x.id !== id))
    setSelected(null)
  }

  async function trashMessage(id: string) {
    if (!confirm('Move this email to Trash? It will be recoverable for 30 days.')) return
    await fetch('/api/email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, trash: true }) })
    setMessages(prev => prev.filter(x => x.id !== id))
    setSelected(null)
  }

  async function deleteDraft(msg: ListMsg) {
    const draftId = (msg as any).draftId
    if (!draftId) return alert('No draft ID — try refreshing the list.')
    if (!confirm('Permanently delete this draft? This cannot be undone.')) return
    await fetch(`/api/email?draftId=${draftId}`, { method: 'DELETE' })
    setMessages(prev => prev.filter(x => x.id !== msg.id))
    setSelected(null)
  }

  function editDraft(msg: FullMsg) {
    // Open compose pre-filled with the draft body. On send, Gmail will create a
    // new sent message; the original draft is then deleted in the background.
    const draftId = (msg as any).draftId || (selected as any)?.draftId
    const fromTo = msg.to || ''
    openCompose({
      to: fromTo,
      subject: msg.subject || '',
      html: msg.html || `<pre>${(msg.text || '').replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;')}</pre>`,
    })
    // Stash the original draft ID so send() can clean it up afterwards
    if (draftId) (window as any).__originalDraftId = draftId
  }

  function openCompose(prefill?: { to?: string; subject?: string; html?: string; inReplyTo?: string; threadId?: string }) {
    setComposeTo(prefill?.to || '')
    setComposeCc('')
    setComposeSubject(prefill?.subject || '')
    setComposeAttachments([])
    setReplyContext(prefill?.inReplyTo ? { inReplyTo: prefill.inReplyTo, threadId: prefill.threadId || '' } : null)
    setShowCompose(true)
    setTimeout(() => {
      if (composeBodyRef.current) {
        // Replies/forwards: signature goes at the TOP (above the quoted thread).
        // New messages: blank space at top, signature at bottom.
        const isReplyOrForward = !!prefill?.html
        composeBodyRef.current.innerHTML = isReplyOrForward
          ? `<p><br></p>${signature}<br>${prefill!.html}`
          : `<p></p>${signature}`
        composeBodyRef.current.focus()
        // Place cursor at start
        const range = document.createRange()
        range.setStart(composeBodyRef.current, 0)
        range.collapse(true)
        const sel = window.getSelection()
        sel?.removeAllRanges(); sel?.addRange(range)
      }
    }, 50)
  }

  function startReply() {
    if (!selected) return
    const fromEmail = selected.from.match(/<([^>]+)>/)?.[1] || selected.from
    const subj = selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`
    const quoted = `<br><br><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555">
      <div style="font-size:13px;color:#666">On ${selected.date}, ${selected.from} wrote:</div>
      ${selected.html || `<pre>${(selected.text || '').replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;')}</pre>`}
    </blockquote>`
    openCompose({ to: fromEmail, subject: subj, html: quoted, inReplyTo: selected.id, threadId: selected.threadId })
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    for (const f of files) {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] || ''
        setComposeAttachments(prev => [...prev, { name: f.name, mimeType: f.type || 'application/octet-stream', base64, size: f.size }])
      }
      reader.readAsDataURL(f)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeAttachment(idx: number) {
    setComposeAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  async function send() {
    setSending(true)
    setError('')
    try {
      const html = composeBodyRef.current?.innerHTML || ''
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject,
          html,
          attachments: composeAttachments.map(a => ({ name: a.name, mimeType: a.mimeType, base64: a.base64 })),
          inReplyTo: replyContext?.inReplyTo,
          threadId: replyContext?.threadId,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Send failed')

      // If we were editing a draft, delete the original now that the new
      // message has been sent successfully.
      const origDraftId = (window as any).__originalDraftId
      if (origDraftId) {
        await fetch(`/api/email?draftId=${origDraftId}`, { method: 'DELETE' }).catch(() => {})
        delete (window as any).__originalDraftId
      }

      setShowCompose(false)
      if (folder === 'sent' || folder === 'drafts') loadList()
    } catch (e: any) {
      setError(e.message)
    }
    setSending(false)
  }

  async function saveDraft() {
    setSending(true)
    setError('')
    try {
      const html = composeBodyRef.current?.innerHTML || ''
      const res = await fetch('/api/email?action=draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject || '(no subject)',
          html,
          attachments: composeAttachments.map(a => ({ name: a.name, mimeType: a.mimeType, base64: a.base64 })),
          inReplyTo: replyContext?.inReplyTo,
          threadId: replyContext?.threadId,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Save failed')
      setShowCompose(false)
      if (folder === 'drafts') loadList()
    } catch (e: any) {
      setError(e.message)
    }
    setSending(false)
  }

  function saveSignature() {
    const html = sigRef.current?.innerHTML || ''
    localStorage.setItem(SIG_KEY, html)
    setSignature(html)
    setShowSettings(false)
  }

  // Rich text helpers — uses execCommand (legacy but works)
  function exec(cmd: string, val?: string) {
    document.execCommand(cmd, false, val)
    composeBodyRef.current?.focus()
  }
  function insertLink() {
    const url = prompt('Link URL:')
    if (url) exec('createLink', url)
  }
  function insertImage() {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    input.onchange = () => {
      const f = input.files?.[0]; if (!f) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        exec('insertHTML', `<img src="${dataUrl}" style="max-width:100%;height:auto" />`)
      }
      reader.readAsDataURL(f)
    }
    input.click()
  }

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
  const fmtFrom = (f: string) => {
    const m = f.match(/^"?([^"<]+?)"?\s*<.+>$/)
    return m ? m[1].trim() : f
  }
  const fmtBytes = (b: number) => b < 1024 ? `${b}B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`

  return (
    <div className={embedded ? 'flex flex-col h-[calc(100vh-180px)]' : 'p-6 md:p-8 pt-16 md:pt-8 h-screen flex flex-col'}>
      {!embedded && (
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-gray-900">Email</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
              <Settings size={14} />Signature
            </button>
            <button onClick={() => openCompose()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm" style={{ background: '#185FA5' }}>
              <Plus size={14} />Compose
            </button>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end gap-2 mb-3">
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
            <Settings size={14} />Signature
          </button>
          <button onClick={() => openCompose()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm" style={{ background: '#185FA5' }}>
            <Plus size={14} />Compose
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="font-bold mb-0.5">{error}</div>
            {/Permission|scope|invalid_grant|unauthorized/i.test(error) && (
              <div className="text-xs text-red-600">
                Your saved Gmail authorization is missing the send/modify permissions. Click "Connect Gmail" to re-authorize.
              </div>
            )}
          </div>
          {/Permission|scope|invalid_grant|unauthorized/i.test(error) && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/email-scan?action=auth-url')
                  const d = await res.json()
                  if (d.authUrl) window.open(d.authUrl, '_blank', 'noopener,noreferrer')
                  else setError(d.error || 'Could not start auth flow')
                } catch (e: any) { setError(e.message) }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 flex-shrink-0">
              <RefreshCw size={13} />Connect Gmail
            </button>
          )}
        </div>
      )}

      <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
        {/* Folders */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 p-2 overflow-y-auto">
          {FOLDERS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => { setFolder(key); setSelected(null) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold ${folder === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div className="col-span-4 bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
              : messages.length === 0 ? <div className="text-center py-12 text-gray-400 text-sm">No messages</div>
                : messages.map(m => (
                  <button key={m.id} onClick={() => openMessage(m)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${selected?.id === m.id ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate ${m.unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{fmtFrom(m.from)}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{fmtDate(m.date)}</span>
                    </div>
                    <div className={`text-sm truncate ${m.unread ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                      {m.hasAttachment && <Paperclip size={11} className="inline mr-1 text-gray-400" />}
                      {m.subject || '(no subject)'}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{m.snippet}</div>
                  </button>
                ))}
          </div>
        </div>

        {/* Reader pane */}
        <div className="col-span-6 bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
          {loadingMsg ? <div className="flex-1 flex justify-center items-center"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
            : !selected ? <div className="flex-1 flex flex-col justify-center items-center text-gray-400">
              <MailOpen size={48} className="mb-3 opacity-30" />
              <p className="text-sm">Select a message to read</p>
            </div>
              : (
                <>
                  <div className="p-5 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h2 className="text-lg font-extrabold text-gray-900">{selected.subject || '(no subject)'}</h2>
                      <div className="flex gap-1 flex-shrink-0">
                        {folder === 'drafts' ? (
                          <>
                            <button onClick={() => editDraft(selected)} title="Edit draft"
                              className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold flex items-center gap-1">
                              <Reply size={13} />Edit
                            </button>
                            <button onClick={() => deleteDraft(selected as any)} title="Delete draft"
                              className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600">
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={startReply} title="Reply" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><Reply size={15} /></button>
                            <button onClick={() => archiveMessage(selected.id)} title="Archive (remove from inbox)" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><Archive size={15} /></button>
                            <button onClick={() => trashMessage(selected.id)} title="Move to Trash" className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600"><Trash2 size={15} /></button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-700"><span className="font-semibold">From:</span> {selected.from}</div>
                    <div className="text-sm text-gray-700"><span className="font-semibold">To:</span> {selected.to}</div>
                    {selected.cc && <div className="text-sm text-gray-700"><span className="font-semibold">Cc:</span> {selected.cc}</div>}
                    <div className="text-xs text-gray-500 mt-1">{selected.date}</div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    {selected.html ? (
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selected.html }} />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{selected.text}</pre>
                    )}
                    {selected.attachments.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-gray-100">
                        <div className="text-xs font-bold text-gray-500 uppercase mb-2">Attachments ({selected.attachments.length})</div>
                        <div className="space-y-2">
                          {selected.attachments.map(a => (
                            <button key={a.attachmentId}
                              onClick={async () => {
                                const r = await fetch(`/api/email?id=${selected.id}&attachmentId=${a.attachmentId}`)
                                const d = await r.json()
                                if (d.data) {
                                  const blob = await (await fetch(`data:${a.mimeType};base64,${d.data.replace(/-/g, '+').replace(/_/g, '/')}`)).blob()
                                  const url = URL.createObjectURL(blob)
                                  const link = document.createElement('a'); link.href = url; link.download = a.filename; link.click()
                                  URL.revokeObjectURL(url)
                                }
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm w-full">
                              <Paperclip size={14} className="text-gray-500" />
                              <span className="font-semibold text-gray-700 flex-1 text-left truncate">{a.filename}</span>
                              <span className="text-xs text-gray-400">{fmtBytes(a.size)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
          <div className="w-full md:max-w-3xl bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-base font-extrabold text-gray-900">{replyContext ? 'Reply' : 'New Message'}</h3>
              <button onClick={() => setShowCompose(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-2 border-b border-gray-100">
                <input value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="To"
                  className="w-full py-2 text-sm focus:outline-none" />
              </div>
              <div className="px-5 py-2 border-b border-gray-100">
                <input value={composeCc} onChange={e => setComposeCc(e.target.value)} placeholder="Cc (optional)"
                  className="w-full py-2 text-sm focus:outline-none" />
              </div>
              <div className="px-5 py-2 border-b border-gray-100">
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Subject"
                  className="w-full py-2 text-sm font-semibold focus:outline-none" />
              </div>
              {/* Toolbar */}
              <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-1 flex-wrap">
                <button onClick={() => exec('bold')} className="p-1.5 rounded hover:bg-gray-100" title="Bold"><Bold size={14} /></button>
                <button onClick={() => exec('italic')} className="p-1.5 rounded hover:bg-gray-100" title="Italic"><Italic size={14} /></button>
                <button onClick={() => exec('underline')} className="p-1.5 rounded hover:bg-gray-100" title="Underline"><Underline size={14} /></button>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button onClick={insertLink} className="p-1.5 rounded hover:bg-gray-100" title="Insert link"><LinkIcon size={14} /></button>
                <button onClick={insertImage} className="p-1.5 rounded hover:bg-gray-100" title="Insert image"><ImageIcon size={14} /></button>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-gray-100 text-xs font-semibold text-gray-600" title="Attach files">
                  <Paperclip size={13} />Attach
                </button>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={handleAttachmentUpload} />
              </div>
              {/* Attachments list */}
              {composeAttachments.length > 0 && (
                <div className="px-5 py-2 border-b border-gray-100 flex flex-wrap gap-2">
                  {composeAttachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs">
                      <Paperclip size={11} />
                      <span className="font-semibold">{a.name}</span>
                      <span className="text-blue-400">{fmtBytes(a.size)}</span>
                      <button onClick={() => removeAttachment(i)} className="hover:text-red-500"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              {/* Body */}
              <div ref={composeBodyRef} contentEditable suppressContentEditableWarning
                className="px-5 py-4 text-sm focus:outline-none min-h-[260px]"
                style={{ lineHeight: '1.6' }} />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <div className="text-xs text-gray-400">From: Lacey@LaceyNPrice.com</div>
              <div className="flex gap-2">
                <button onClick={() => setShowCompose(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
                <button onClick={saveDraft} disabled={sending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">
                  <Save size={13} />Save Draft
                </button>
                <button onClick={send} disabled={sending || !composeTo || !composeSubject}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#185FA5' }}>
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-base font-extrabold text-gray-900">Email Signature</h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-3">This signature is appended to every new email and reply. Supports formatting and images.</p>
              <div className="border border-gray-200 rounded-xl">
                <div className="flex gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                  <button onClick={() => { sigRef.current?.focus(); document.execCommand('bold') }} className="p-1.5 rounded hover:bg-gray-200"><Bold size={13} /></button>
                  <button onClick={() => { sigRef.current?.focus(); document.execCommand('italic') }} className="p-1.5 rounded hover:bg-gray-200"><Italic size={13} /></button>
                  <button onClick={() => {
                    const url = prompt('Link URL:'); if (url) { sigRef.current?.focus(); document.execCommand('createLink', false, url) }
                  }} className="p-1.5 rounded hover:bg-gray-200"><LinkIcon size={13} /></button>
                  <button onClick={() => {
                    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'
                    input.onchange = () => {
                      const f = input.files?.[0]; if (!f) return
                      const r = new FileReader()
                      r.onload = () => { sigRef.current?.focus(); document.execCommand('insertHTML', false, `<img src="${r.result}" style="max-width:200px;height:auto" />`) }
                      r.readAsDataURL(f)
                    }; input.click()
                  }} className="p-1.5 rounded hover:bg-gray-200"><ImageIcon size={13} /></button>
                </div>
                <div ref={sigRef} contentEditable suppressContentEditableWarning
                  className="px-4 py-3 text-sm focus:outline-none min-h-[180px]"
                  style={{ lineHeight: '1.6' }}
                  dangerouslySetInnerHTML={{ __html: signature }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => { localStorage.removeItem(SIG_KEY); setSignature(DEFAULT_SIGNATURE); if (sigRef.current) sigRef.current.innerHTML = DEFAULT_SIGNATURE }}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Reset to default</button>
              <button onClick={saveSignature} className="px-5 py-2 rounded-xl text-white text-sm font-bold" style={{ background: '#185FA5' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
