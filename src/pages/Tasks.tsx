import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Trash2, X, Sparkles } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, trDate, trDateTime, today } from '../lib/rows'
import { demoTasks } from '../data/demo'
import { ASSISTANT, levelLabel, statusLabel, taskCode, type Task, type TaskLevel, type TaskStatus } from '../lib/types'
import { gameById } from '../data/sample'
import { GameLogo, Modal, SampleBanner, initials, useIsMobile } from '../components/ui'

const cols: { id: TaskStatus; color: string }[] = [
  { id: 'open', color: '#D9D9D9' },
  { id: 'doing', color: '#E8C07A' },
  { id: 'done', color: '#8FD3AE' },
]
const levelColor: Record<TaskLevel, string> = { critical: '#FF7A55', medium: '#E8C07A', low: '#8FD3AE' }

// Görevler: üç sütunlu pano, sürükle-bırak, sağda düzenlenebilir detay
export default function Tasks() {
  const { rows: tasks, insert, update, remove } = useRows<Task>('tasks', demoTasks, { order: 'created_at', ascending: false })
  const { toast } = useStore()
  const { me } = usePeople()
  const mobile = useIsMobile()
  const [params, setParams] = useSearchParams()
  const sel = Number(params.get('id')) || null
  const [q, setQ] = useState('')
  const [mine, setMine] = useState(false)
  const [compact, setCompact] = useState(false)
  const [adding, setAdding] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)

  const select = (id: number | null) => setParams(id ? { id: String(id) } : {}, { replace: true })
  const selected = tasks.find((t) => t.id === sel) ?? null

  const visible = tasks.filter(
    (t) => (!mine || t.assignee === me.email) && (!q || `${t.title} ${t.tags.join(' ')} ${taskCode(t.id)}`.toLowerCase().includes(q.toLowerCase())),
  )

  async function save(t: Task, patch: Partial<Task>, what?: string) {
    const history = what ? [...t.history, { what, at: new Date().toISOString() }] : t.history
    try {
      await update(t.id, { ...patch, history, updated_at: new Date().toISOString() })
    } catch (e) {
      toast('Kaydedilemedi: ' + (e as Error).message, 'warn')
    }
  }

  function move(id: number, status: TaskStatus) {
    const t = tasks.find((x) => x.id === id)
    if (!t || t.status === status) return
    save(t, { status }, `${statusLabel[t.status]} → ${statusLabel[status]}`)
    if (status === 'done') toast(`${taskCode(id)} bitti`)
  }

  async function del(t: Task) {
    if (!window.confirm(`"${t.title}" silinsin mi?`)) return
    select(null)
    try {
      await remove(t.id)
      toast('Görev silindi', 'info')
    } catch (e) {
      toast('Silinemedi: ' + (e as Error).message, 'warn')
    }
  }

  const detail = selected && <Detail t={selected} onSave={save} onDelete={() => del(selected)} onClose={() => select(null)} />

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Görevler</span>
          <h1>İş panosu</h1>
          <p>Kartı sürükleyip sütun değiştir. Kartı seçince ayrıntıları düzenleyebilirsin.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={15} /> Yeni görev
        </button>
      </div>

      <div className="flex wrap" style={{ gap: 10 }}>
        <label className="search" style={{ flex: '1 1 220px' }}>
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Görev, etiket ya da PG-kodu ara" aria-label="Görev ara" />
        </label>
        <div className="seg">
          <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>Hepsi</button>
          <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>Görevlerim</button>
        </div>
        <button type="button" className="btn" aria-pressed={compact} onClick={() => setCompact(!compact)}>
          {compact ? 'Kartları büyüt' : 'Kartları küçült'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected && !mobile ? 'minmax(0, 1fr) 340px' : '1fr', gap: 14, alignItems: 'start' }}>
        <div className={`kanban ${compact ? 'compact' : ''}`}>
          {cols.map((c) => {
            const list = visible.filter((t) => t.status === c.id)
            return (
              <section
                key={c.id}
                className={`kcol ${over === c.id ? 'drop' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(c.id)
                }}
                onDragLeave={() => setOver(null)}
                onDrop={() => {
                  if (drag != null) move(drag, c.id)
                  setDrag(null)
                  setOver(null)
                }}
              >
                <div className="kcol-head">
                  <span className="ring" style={{ borderColor: c.color }} />
                  <h2>{statusLabel[c.id]}</h2>
                  <span className="count">{list.length}</span>
                </div>
                {list.length === 0 && <div className="empty" style={{ padding: 18 }}>Boş</div>}
                {list.map((t) => (
                  <Card key={t.id} t={t} on={t.id === sel} dragging={drag === t.id} onPick={() => select(t.id === sel ? null : t.id)} onDrag={setDrag} onMove={move} />
                ))}
              </section>
            )
          })}
        </div>
        {selected && !mobile && detail}
      </div>

      {selected && mobile && (
        <div className="modal-back" onClick={() => select(null)}>
          <div className="modal" style={{ padding: 0, background: 'none', border: 0 }} onClick={(e) => e.stopPropagation()}>
            {detail}
          </div>
        </div>
      )}

      {adding && (
        <AddTask
          onClose={() => setAdding(false)}
          onAdd={async (t) => {
            try {
              const row = await insert({ ...t, created_by: me.email, history: [{ what: 'Elle oluşturuldu', at: new Date().toISOString() }] })
              setAdding(false)
              select(row.id)
              toast('Görev eklendi')
            } catch (e) {
              toast('Eklenemedi: ' + (e as Error).message, 'warn')
            }
          }}
        />
      )}
    </div>
  )
}

function Card({ t, on, dragging, onPick, onDrag, onMove }: { t: Task; on: boolean; dragging: boolean; onPick: () => void; onDrag: (id: number | null) => void; onMove: (id: number, s: TaskStatus) => void }) {
  const { nameOf } = usePeople()
  const done = t.subtasks.filter((s) => s.done).length
  const late = t.due_date && t.status !== 'done' && t.due_date < today()
  const g = t.game_id ? gameById(t.game_id) : null
  return (
    <div
      className={`kcard ${on ? 'on' : ''} ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={() => onDrag(t.id)}
      onDragEnd={() => onDrag(null)}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onPick()
        // Klavyeyle sütun değiştirme: sağ/sol ok
        const order: TaskStatus[] = ['open', 'doing', 'done']
        const i = order.indexOf(t.status)
        if (e.key === 'ArrowRight' && i < 2) onMove(t.id, order[i + 1])
        if (e.key === 'ArrowLeft' && i > 0) onMove(t.id, order[i - 1])
      }}
    >
      <span className="blob" style={{ background: levelColor[t.level] }} />
      <div className="kcard-top">
        <span className="id">{taskCode(t.id)}</span>
        <span className="badge" style={{ background: levelColor[t.level] + '22', color: levelColor[t.level] }}>{levelLabel[t.level]}</span>
      </div>
      <div className="kcard-title">
        {t.game_id && <GameLogo id={t.game_id} size={22} />}
        <span style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined, opacity: t.status === 'done' ? 0.6 : 1 }}>{t.title}</span>
      </div>
      {(t.tags.length > 0 || g) && (
        <div className="tags">
          {g && <span className="chip">{g.name}</span>}
          {t.tags.map((x) => <span key={x} className="chip">{x}</span>)}
        </div>
      )}
      <div className="kcard-foot">
        <span className={`avatar sm ${t.assignee === ASSISTANT ? 'ai' : ''}`} title={nameOf(t.assignee)}>{t.assignee === ASSISTANT ? 'AI' : initials(nameOf(t.assignee))}</span>
        <span className="grow">{t.subtasks.length > 0 ? `${done}/${t.subtasks.length} adım` : ''}</span>
        {t.due_date && <span style={{ color: late ? 'var(--orange)' : undefined }}>{trDate(t.due_date)}</span>}
      </div>
    </div>
  )
}

function Detail({ t, onSave, onDelete, onClose }: { t: Task; onSave: (t: Task, p: Partial<Task>, what?: string) => void; onDelete: () => void; onClose: () => void }) {
  const { games } = useData()
  const { people, nameOf } = usePeople()
  const [title, setTitle] = useState(t.title)
  const [notes, setNotes] = useState(t.notes ?? '')
  const [step, setStep] = useState('')
  useEffect(() => {
    setTitle(t.title)
    setNotes(t.notes ?? '')
  }, [t.id, t.title, t.notes])

  const setSub = (subtasks: Task['subtasks']) => onSave(t, { subtasks })

  return (
    <aside className="detail fade-in" aria-label="Görev ayrıntısı">
      <div className="flex between">
        <span className="muted small">{taskCode(t.id)}</span>
        <div className="flex" style={{ gap: 6 }}>
          <button type="button" className="icon-btn" onClick={onDelete} title="Sil" aria-label="Görevi sil"><Trash2 size={14} /></button>
          <button type="button" className="icon-btn" onClick={onClose} title="Kapat" aria-label="Kapat"><X size={14} /></button>
        </div>
      </div>
      <textarea
        className="editor-title"
        style={{ fontSize: 18, resize: 'none' }}
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== t.title && onSave(t, { title: title.trim() })}
        aria-label="Başlık"
      />
      <div className="kv">
        <span>Durum</span>
        <select className="select" value={t.status} onChange={(e) => onSave(t, { status: e.target.value as TaskStatus }, `${statusLabel[t.status]} → ${statusLabel[e.target.value as TaskStatus]}`)}>
          {(['open', 'doing', 'done'] as const).map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
        <span>Öncelik</span>
        <select className="select" value={t.level} onChange={(e) => onSave(t, { level: e.target.value as TaskLevel })}>
          {(['critical', 'medium', 'low'] as const).map((s) => <option key={s} value={s}>{levelLabel[s]}</option>)}
        </select>
        <span>Oyun</span>
        <select className="select" value={t.game_id ?? ''} onChange={(e) => onSave(t, { game_id: e.target.value || null })}>
          <option value="">Genel</option>
          {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <span>Sorumlu</span>
        <select className="select" value={t.assignee ?? ''} onChange={(e) => onSave(t, { assignee: e.target.value || null }, `Sorumlu: ${nameOf(e.target.value)}`)}>
          <option value="">Kimse</option>
          {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
          <option value={ASSISTANT}>Asistan</option>
        </select>
        <span>Son tarih</span>
        <input className="input" type="date" value={t.due_date ?? ''} onChange={(e) => onSave(t, { due_date: e.target.value || null })} />
        <span>Etiketler</span>
        <input
          className="input"
          defaultValue={t.tags.join(', ')}
          key={t.id + t.tags.join()}
          placeholder="virgülle ayır"
          onBlur={(e) => onSave(t, { tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
        />
      </div>

      {t.advice && (
        <div className="inner" style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div className="flex" style={{ gap: 6, marginBottom: 6, color: 'var(--green)' }}><Sparkles size={13} /> <b style={{ fontWeight: 500 }}>Öneri</b></div>
          {t.advice}
        </div>
      )}

      <div>
        <div className="card-sub" style={{ marginBottom: 8 }}>Adımlar</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {t.subtasks.map((s, i) => (
            <div key={i} className="flex between" style={{ gap: 6 }}>
              <label className="check">
                <input type="checkbox" checked={s.done} onChange={() => setSub(t.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
                <span className="box">✓</span>
                <span className="lbl">{s.title}</span>
              </label>
              <button type="button" className="linkish" onClick={() => setSub(t.subtasks.filter((_, j) => j !== i))} aria-label="Adımı sil"><X size={11} /></button>
            </div>
          ))}
          <form
            className="flex"
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!step.trim()) return
              setSub([...t.subtasks, { title: step.trim(), done: false }])
              setStep('')
            }}
          >
            <input className="input" style={{ height: 30, fontSize: 11 }} value={step} onChange={(e) => setStep(e.target.value)} placeholder="Adım ekle" aria-label="Yeni adım" />
            <button className="btn sm" type="submit"><Plus size={12} /></button>
          </form>
        </div>
      </div>

      <div>
        <div className="card-sub" style={{ marginBottom: 8 }}>Notlar</div>
        <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (t.notes ?? '') && onSave(t, { notes: notes || null })} placeholder="Bu görevle ilgili notlar" />
      </div>

      {t.history.length > 0 && (
        <div>
          <div className="card-sub" style={{ marginBottom: 8 }}>Geçmiş</div>
          {[...t.history].reverse().slice(0, 6).map((h, i) => (
            <div key={i} className="flex between muted" style={{ fontSize: 10, padding: '3px 0', gap: 10 }}>
              <span>{h.what}</span>
              <span>{trDateTime(h.at)}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

function AddTask({ onClose, onAdd }: { onClose: () => void; onAdd: (t: Partial<Task>) => void }) {
  const { games } = useData()
  const { people, me } = usePeople()
  const [f, setF] = useState<Partial<Task>>({ title: '', level: 'medium', status: 'open', game_id: null, assignee: me.email, due_date: null, tags: [], subtasks: [] })
  return (
    <Modal title="Yeni görev" onClose={onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (f.title?.trim()) onAdd({ ...f, title: f.title.trim() })
        }}
      >
        <div className="field">
          <label htmlFor="t-title">Başlık</label>
          <input id="t-title" className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ne yapılacak?" />
        </div>
        <div className="grid g-2" style={{ gap: 10 }}>
          <div className="field">
            <label htmlFor="t-level">Öncelik</label>
            <select id="t-level" className="select" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as TaskLevel })}>
              {(['critical', 'medium', 'low'] as const).map((s) => <option key={s} value={s}>{levelLabel[s]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-game">Oyun</label>
            <select id="t-game" className="select" value={f.game_id ?? ''} onChange={(e) => setF({ ...f, game_id: e.target.value || null })}>
              <option value="">Genel</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-who">Sorumlu</label>
            <select id="t-who" className="select" value={f.assignee ?? ''} onChange={(e) => setF({ ...f, assignee: e.target.value || null })}>
              {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
              <option value={ASSISTANT}>Asistan</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-due">Son tarih</label>
            <input id="t-due" className="input" type="date" value={f.due_date ?? ''} onChange={(e) => setF({ ...f, due_date: e.target.value || null })} />
          </div>
        </div>
        <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Vazgeç</button>
          <button type="submit" className="btn btn-primary" disabled={!f.title?.trim()}>Ekle</button>
        </div>
      </form>
    </Modal>
  )
}
