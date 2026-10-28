import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, Eye, ListTodo, PenLine, Plus, Search, Trash2 } from 'lucide-react'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, trDateTime } from '../lib/rows'
import { demoNotes, demoTasks } from '../data/demo'
import type { Note, Task } from '../lib/types'
import { SampleBanner, useIsMobile } from '../components/ui'
import Attachments from '../components/Attachments'
import Comments from '../components/Comments'
import { logActivity } from '../lib/files'

// Notlar: klasörler, liste ve basit editör.
// Not metni sade yazılır: "[ ] başlık" yapılacak iş, "[x] başlık" bitmiş iş, "- madde" alt madde.
export default function Notes() {
  const { rows: notes, insert, update, remove } = useRows<Note>('notes', demoNotes, { order: 'updated_at', ascending: false })
  const { insert: insertTask } = useRows<Task>('tasks', demoTasks)
  const { toast } = useStore()
  const { me, nameOf } = usePeople()
  const mobile = useIsMobile()
  const [folder, setFolder] = useState<string | null>(null)
  // Bağlantıyla gelinirse (/notlar?id=5) o not açılır
  const [params] = useSearchParams()
  const [selId, setSelId] = useState<number | null>(Number(params.get('id')) || null)
  const [edit, setEdit] = useState(false)
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const folders = [...new Set(notes.map((n) => n.folder))].sort((a, b) => a.localeCompare(b, 'tr'))
  const list = notes
    .filter((n) => (!folder || n.folder === folder) && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const sel = notes.find((n) => n.id === selId) ?? (mobile ? null : list[0] ?? null)

  useEffect(() => {
    setTitle(sel?.title ?? '')
    setBody(sel?.body ?? '')
  }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(patch: Partial<Note>) {
    if (!sel) return
    try {
      await update(sel.id, { ...patch, updated_at: new Date().toISOString() })
    } catch (e) {
      toast('Kaydedilemedi: ' + (e as Error).message, 'warn')
    }
  }

  async function add() {
    try {
      const n = await insert({ title: 'Yeni not', folder: folder ?? 'Genel', tag: null, body: '[ ] İlk iş\n- ayrıntı', created_by: me.email, updated_at: new Date().toISOString() })
      setSelId(n.id)
      setEdit(true)
      logActivity(me.email, 'Yeni not açtı', `/notlar?id=${n.id}`).catch(() => {})
    } catch (e) {
      toast('Not eklenemedi: ' + (e as Error).message, 'warn')
    }
  }

  async function del() {
    if (!sel || !window.confirm(`"${sel.title}" silinsin mi?`)) return
    await remove(sel.id).catch((e) => toast('Silinemedi: ' + e.message, 'warn'))
    setSelId(null)
    toast('Not silindi', 'info')
  }

  async function toTask() {
    if (!sel) return
    const open = sel.body.split('\n').filter((l) => l.startsWith('[ ]')).map((l) => ({ title: l.slice(3).trim(), done: false }))
    try {
      const t = await insertTask({
        title: sel.title, status: 'open', level: 'medium', subtasks: open, tags: [sel.folder], assignee: me.email, created_by: me.email,
        source: `note:${sel.id}`, history: [{ what: 'Nottan oluşturuldu', at: new Date().toISOString() }],
      })
      toast(`Görev oluşturuldu (${open.length} adım)`)
      return t
    } catch (e) {
      toast('Görev oluşturulamadı: ' + (e as Error).message, 'warn')
    }
  }

  function toggleLine(i: number) {
    const lines = body.split('\n')
    const l = lines[i]
    lines[i] = l.startsWith('[x]') ? '[ ]' + l.slice(3) : '[x]' + l.slice(3)
    const next = lines.join('\n')
    setBody(next)
    save({ body: next })
  }

  const lines = body.split('\n')
  const todo = lines.filter((l) => /^\[( |x)\]/.test(l))
  const doneCount = todo.filter((l) => l.startsWith('[x]')).length

  const editor = sel && (
    <section className="editor fade-in">
      <div className="editor-bar">
        <span>{sel.folder} · {nameOf(sel.created_by)} · {trDateTime(sel.updated_at)}</span>
        <div className="flex wrap" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => setEdit(!edit)}>
            {edit ? <><Eye size={12} /> Görüntüle</> : <><PenLine size={12} /> Düzenle</>}
          </button>
          <button type="button" className="btn sm" onClick={toTask}><ListTodo size={12} /> Göreve çevir</button>
          <button
            type="button"
            className="btn sm"
            onClick={() => navigator.clipboard.writeText(`${sel.title}\n\n${body}`).then(() => toast('Not panoya kopyalandı'))}
          >
            <Copy size={12} /> Paylaş
          </button>
          <button type="button" className="icon-btn" onClick={del} aria-label="Notu sil"><Trash2 size={13} /></button>
        </div>
      </div>
      <div className="editor-body">
        <input className="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== sel.title && save({ title: title.trim() })} aria-label="Not başlığı" />
        <div className="flex wrap" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ height: 30, fontSize: 11, width: 150 }}
            defaultValue={sel.folder}
            key={'f' + sel.id}
            onBlur={(e) => e.target.value.trim() && e.target.value !== sel.folder && save({ folder: e.target.value.trim() })}
            aria-label="Klasör"
            placeholder="Klasör"
          />
          <input
            className="input"
            style={{ height: 30, fontSize: 11, width: 120 }}
            defaultValue={sel.tag ?? ''}
            key={'t' + sel.id}
            onBlur={(e) => e.target.value !== (sel.tag ?? '') && save({ tag: e.target.value.trim() || null })}
            aria-label="Etiket"
            placeholder="Etiket"
          />
          {todo.length > 0 && <span className="chip">{doneCount}/{todo.length} tamam</span>}
        </div>
        {edit ? (
          <>
            <textarea className="textarea" rows={16} value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => body !== sel.body && save({ body })} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} aria-label="Not metni" />
            <span className="muted" style={{ fontSize: 10 }}>"[ ] iş" yapılacak · "[x] iş" bitti · "- madde" alt madde</span>
          </>
        ) : (
          <div className="note-view">
            {lines.map((l, i) =>
              /^\[( |x)\]/.test(l) ? (
                <label key={i} className="check todo" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={l.startsWith('[x]')} onChange={() => toggleLine(i)} />
                  <span className="box">✓</span>
                  <span className="lbl" style={{ fontWeight: 500 }}>{l.slice(3).trim()}</span>
                </label>
              ) : l.startsWith('- ') ? (
                <div key={i} className="li">• {l.slice(2)}</div>
              ) : l.trim() ? (
                <p key={i}>{l}</p>
              ) : null,
            )}
          </div>
        )}
        <Attachments noteId={sel.id} folder={sel.folder} label={sel.title} />
        <Comments noteId={sel.id} label={sel.title} />
      </div>
    </section>
  )

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Notlar</span>
          <h1>Dokümanlar</h1>
          <p>Tasarım dokümanları, yama notları, fikirler. Bir notu tek tıkla göreve çevir.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={add}><Plus size={15} /> Yeni not</button>
      </div>

      {mobile && sel ? (
        <>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setSelId(null)}>← Notlar</button>
          {editor}
        </>
      ) : (
        <div className="notes-layout">
          <nav className="notes-side" aria-label="Klasörler">
            <span className="card-sub" style={{ padding: '0 10px 8px' }}>Klasörler</span>
            <button type="button" className={`side-link ${!folder ? 'on' : ''}`} onClick={() => setFolder(null)}>
              <span className="sq" /> Tümü <span className="muted" style={{ marginLeft: 'auto' }}>{notes.length}</span>
            </button>
            {folders.map((f) => (
              <button key={f} type="button" className={`side-link ${folder === f ? 'on' : ''}`} onClick={() => setFolder(f)}>
                <span className="sq" /> {f} <span className="muted" style={{ marginLeft: 'auto' }}>{notes.filter((n) => n.folder === f).length}</span>
              </button>
            ))}
            <Link to="/gorevler" className="side-link" style={{ marginTop: 'auto' }}><ListTodo size={12} /> Görevlere git</Link>
          </nav>
          <div className="notes-list">
            <label className="search">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Notlarda ara" aria-label="Notlarda ara" />
            </label>
            {list.length === 0 && <div className="empty">Not yok. “Yeni not” ile başla.</div>}
            {list.map((n) => (
              <button key={n.id} type="button" className={`note-item ${sel?.id === n.id ? 'on' : ''}`} onClick={() => { setSelId(n.id); setEdit(false) }}>
                <b>{n.title}</b>
                <small>
                  {n.tag && <span className="chip" style={{ fontSize: 9 }}>{n.tag}</span>}
                  {n.folder} · {trDateTime(n.updated_at)}
                </small>
              </button>
            ))}
          </div>
          {editor || <div className="editor"><div className="empty">Bir not seç ya da yeni not oluştur.</div></div>}
        </div>
      )}
    </div>
  )
}
