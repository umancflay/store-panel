import { useState } from 'react'
import { Link2Off, ChevronDown, AlertTriangle, BookOpen } from 'lucide-react'
import { requirements } from '../data/requirements'
import { useData } from '../lib/data'

// Bağlı olmayan bir veri kaynağının yerinde gösterilen kart:
// bağlanınca ne gelecek, ne gerekiyor ve adım adım nasıl bağlanır.
export default function Needs({ source, title }: { source: string; title?: string }) {
  const req = requirements[source]
  const { connections } = useData()
  const [open, setOpen] = useState(false)
  if (!req) return null
  const conn = connections.find((c) => c.source === source)
  const error = conn?.status === 'error'

  return (
    <div className="card needs fade-in">
      <div className="flex" style={{ alignItems: 'flex-start', gap: 14 }}>
        <span className="icon-box" style={{ background: error ? 'rgba(255,77,94,0.15)' : '#1a1f37', color: error ? 'var(--red)' : 'var(--muted)', boxShadow: 'none' }}>
          {error ? <AlertTriangle size={20} /> : <Link2Off size={20} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex wrap" style={{ gap: 8 }}>
            <b style={{ fontSize: 15 }}>{title ?? `${req.name} bağlı değil`}</b>
            <span className={`badge ${error ? 'b-critical' : 'b-muted'}`}>{error ? 'Bağlantı hatası' : `${req.phase}. aşama`}</span>
          </div>
          <p className="muted small" style={{ marginTop: 6, lineHeight: 1.55 }}>
            <b style={{ color: '#dbe4f3' }}>Bağlanınca:</b> {req.gives}
          </p>
          {error && conn?.message && <p className="small" style={{ marginTop: 8, color: '#ff8a95', lineHeight: 1.5 }}>{conn.message}</p>}
          <div className="small" style={{ marginTop: 10 }}>
            <b>Gerekenler:</b>
            <ul className="needs-list">{req.needs.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setOpen(!open)}>
            <BookOpen size={14} /> Nasıl bağlanır? <ChevronDown size={14} className={`chev ${open ? 'open' : ''}`} />
          </button>
          {open && (
            <div className="inner fade-in" style={{ marginTop: 12 }}>
              <ol className="steps">{req.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {req.note && <p className="muted small" style={{ marginTop: 10 }}>{req.note}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
