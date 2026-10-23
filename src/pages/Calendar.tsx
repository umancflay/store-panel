import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Trash2, Lightbulb } from 'lucide-react'
import { useData } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, addDays, daysBetween, monthName, today, trDate } from '../lib/rows'
import { demoEvents, demoPlans, demoTasks } from '../data/demo'
import { eventColor, eventLabel, type CalEvent, type EventKind, type Plan, type Task } from '../lib/types'
import { Modal, SampleBanner, useIsMobile } from '../components/ui'

// Takvimde gösterilen tek tip kayıt: elle eklenen etkinlikler + görev son tarihleri +
// politika uyarısı son tarihleri + plan hedef tarihleri + sezon fırsatları
interface Item {
  key: string
  date: string
  title: string
  kind: EventKind
  link?: string
  event?: CalEvent
  tip?: string
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Mobil oyunlar için önemli dönemler (her yıl yeniden hesaplanır)
function seasons(year: number): Item[] {
  const nthDay = (month: number, weekday: number, n: number) => {
    const d = new Date(year, month, 1)
    while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
    d.setDate(d.getDate() + (n - 1) * 7)
    return d
  }
  const bf = nthDay(10, 5, 4) // Kasım'ın 4. cuması
  const cm = new Date(bf)
  cm.setDate(bf.getDate() + 3)
  const list: [Date, string, string][] = [
    [new Date(year, 1, 14), 'Sevgililer Günü', 'Kozmetik/paket indirimi için iyi gün.'],
    [new Date(year, 3, 23), '23 Nisan', 'TR’de çocuklar tatilde: oynama süresi artar.'],
    [new Date(year, 5, 20), 'Yaz tatili başlıyor', 'Yaz etkinliği ve reklam bütçesi artışı için hazırlan.'],
    [new Date(year, 9, 31), 'Cadılar Bayramı', 'Tema etkinliği 1 hafta önceden yayında olmalı.'],
    [bf, 'Black Friday', 'Reklam fiyatları (eCPM) yükselir; IAP indirimi yap.'],
    [cm, 'Cyber Monday', 'Black Friday indirimini uzat.'],
    [new Date(year, 11, 25), 'Noel', 'Yurt dışında en yüksek indirme haftası.'],
    [new Date(year, 11, 31), 'Yılbaşı', 'Yılbaşı etkinliği; mağaza incelemeleri bu hafta yavaşlar.'],
  ]
  return list.map(([d, title, tip]) => ({ key: `s:${iso(d)}`, date: iso(d), title, kind: 'event' as const, tip }))
}

export default function Calendar() {
  const { games } = useData()
  const { alerts, toast } = useStore()
  const { rows: events, insert, update, remove } = useRows<CalEvent>('events', demoEvents, { order: 'date' })
  const { rows: tasks } = useRows<Task>('tasks', demoTasks)
  const { rows: plans } = useRows<Plan>('plans', demoPlans)
  const mobile = useIsMobile(640)
  const nav = useNavigate()
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [editing, setEditing] = useState<Partial<CalEvent> | null>(null)
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const t = today()

  const items = useMemo<Item[]>(() => {
    const out: Item[] = events.map((e) => ({ key: `e:${e.id}`, date: e.date, title: e.title, kind: e.kind, event: e }))
    for (const x of tasks) if (x.due_date && x.status !== 'done') out.push({ key: `t:${x.id}`, date: x.due_date, title: x.title, kind: 'deadline', link: `/gorevler?id=${x.id}` })
    for (const a of alerts) if (a.deadline && a.status === 'open') out.push({ key: `a:${a.id}`, date: a.deadline.slice(0, 10), title: a.title, kind: 'deadline', link: '/uyarilar' })
    for (const p of plans) if (p.target_date) out.push({ key: `p:${p.id}`, date: p.target_date, title: `${p.name} yayını`, kind: 'release', link: '/plan' })
    out.push(...seasons(ym.y), ...seasons(ym.y + 1))
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }, [events, tasks, alerts, plans, ym.y])

  // Pazartesiden başlayan 6 haftalık ızgara
  const first = new Date(ym.y, ym.m, 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const byDate = new Map<string, Item[]>()
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it])

  const upcoming = items.filter((i) => i.date >= t && !i.tip).slice(0, 8)
  const tips = items.filter((i) => i.tip && i.date >= t && daysBetween(t, i.date) <= 75).slice(0, 3)

  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }))

  function open(it: Item) {
    if (it.event) setEditing(it.event)
    else if (it.link) nav(it.link)
    else if (it.tip) setEditing({ date: addDays(it.date, -7), title: `${it.title} hazırlığı`, kind: 'ad', note: it.tip })
  }

  async function saveEvent() {
    if (!editing?.title?.trim() || !editing.date) return
    try {
      const row = { date: editing.date, title: editing.title.trim(), kind: editing.kind ?? 'event', game_id: editing.game_id ?? null, note: editing.note ?? null }
      if (editing.id) await update(editing.id, row)
      else await insert(row)
      toast(editing.id ? 'Etkinlik güncellendi' : 'Etkinlik eklendi')
      setEditing(null)
    } catch (e) {
      toast('Kaydedilemedi: ' + (e as Error).message, 'warn')
    }
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Takvim</span>
          <h1>{monthName(ym.m)} {ym.y}</h1>
          <p>Sürümler, son tarihler, etkinlikler ve sezon fırsatları tek yerde.</p>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Önceki ay"><ChevronLeft size={16} /></button>
          <button type="button" className="btn" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Bugün</button>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Sonraki ay"><ChevronRight size={16} /></button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ date: t, kind: 'event', title: '' })}><Plus size={15} /> Ekle</button>
        </div>
      </div>

      <div className="flex wrap" style={{ gap: 14, fontSize: 11 }}>
        {(Object.keys(eventLabel) as EventKind[]).map((k) => (
          <span key={k} className="flex muted" style={{ gap: 6 }}><span className="dot" style={{ background: eventColor[k] }} />{eventLabel[k]}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1fr) 300px', gap: 14, alignItems: 'start' }}>
        <div className="card" style={{ overflowX: 'auto', padding: mobile ? 10 : undefined }}>
          <div className="cal" style={mobile ? { minWidth: 0 } : undefined}>
            <div className="cal-dow">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => <span key={d}>{d}</span>)}</div>
            <div className="cal-grid" style={mobile ? { gap: 4 } : undefined}>
              {cells.map((d) => {
                const k = iso(d)
                const list = byDate.get(k) ?? []
                return (
                  <div
                    key={k}
                    className={`cal-cell ${d.getMonth() !== ym.m ? 'other' : ''} ${k === t ? 'today' : ''}`}
                    style={mobile ? { minHeight: 48, padding: 5, borderRadius: 10 } : undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`${trDate(k)}: ${list.length} kayıt`}
                    onClick={() => (mobile ? setDayOpen(k) : setEditing({ date: k, kind: 'event', title: '' }))}
                    onKeyDown={(e) => e.key === 'Enter' && setDayOpen(k)}
                  >
                    <span className="n">{d.getDate()}</span>
                    {mobile ? (
                      <span className="flex" style={{ gap: 3, flexWrap: 'wrap' }}>
                        {list.slice(0, 4).map((it) => <span key={it.key} className="dot" style={{ width: 6, height: 6, background: eventColor[it.kind], opacity: it.tip ? 0.5 : 1 }} />)}
                      </span>
                    ) : (
                      <>
                        {list.slice(0, 3).map((it) => (
                          <span
                            key={it.key}
                            className="ev"
                            style={{ borderColor: eventColor[it.kind], opacity: it.tip ? 0.6 : 1, fontStyle: it.tip ? 'italic' : undefined }}
                            title={it.tip ?? it.title}
                            onClick={(e) => {
                              e.stopPropagation()
                              open(it)
                            }}
                          >
                            {it.title}
                          </span>
                        ))}
                        {list.length > 3 && (
                          <span className="muted" style={{ fontSize: 10 }} onClick={(e) => { e.stopPropagation(); setDayOpen(k) }}>+{list.length - 3} daha</span>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-title">Yaklaşanlar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {upcoming.length === 0 && <div className="muted small">Yaklaşan kayıt yok.</div>}
              {upcoming.map((it) => (
                <button key={it.key} type="button" className="upcoming linkish" style={{ fontSize: 12, color: '#fff', textAlign: 'left' }} onClick={() => open(it)}>
                  <span className="date-tile" style={{ borderBottom: `2px solid ${eventColor[it.kind]}` }}>
                    <b>{new Date(it.date + 'T00:00:00').getDate()}</b>
                    <small>{monthName(new Date(it.date + 'T00:00:00').getMonth()).slice(0, 3)}</small>
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                    <small className="muted">{eventLabel[it.kind]} · {daysBetween(t, it.date) === 0 ? 'bugün' : `${daysBetween(t, it.date)} gün sonra`}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {tips.length > 0 && (
            <div className="card">
              <div className="card-title flex" style={{ gap: 8 }}><Lightbulb size={14} color="var(--gold)" /> Sezon fırsatları</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {tips.map((it) => (
                  <div key={it.key} style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <b style={{ fontWeight: 500 }}>{it.title}</b> <span className="muted">· {trDate(it.date)}</span>
                    <div className="muted">{it.tip}</div>
                    <button type="button" className="linkish" onClick={() => open(it)}>Hazırlık etkinliği ekle →</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {dayOpen && (
        <Modal title={trDate(dayOpen, true)} onClose={() => setDayOpen(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(byDate.get(dayOpen) ?? []).length === 0 && <div className="muted small">Bu günde kayıt yok.</div>}
            {(byDate.get(dayOpen) ?? []).map((it) => (
              <button key={it.key} type="button" className="ev" style={{ borderColor: eventColor[it.kind], fontSize: 12, padding: '8px 10px', textAlign: 'left', cursor: 'pointer', whiteSpace: 'normal' }} onClick={() => { setDayOpen(null); open(it) }}>
                {it.title}
                {it.tip && <div className="muted" style={{ fontSize: 11 }}>{it.tip}</div>}
              </button>
            ))}
            <button type="button" className="btn btn-primary" onClick={() => { setEditing({ date: dayOpen, kind: 'event', title: '' }); setDayOpen(null) }}><Plus size={14} /> Bu güne ekle</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? 'Etkinliği düzenle' : 'Yeni etkinlik'} onClose={() => setEditing(null)}>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={(e) => { e.preventDefault(); saveEvent() }}>
            <div className="field">
              <label htmlFor="e-title">Başlık</label>
              <input id="e-title" className="input" autoFocus value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field">
                <label htmlFor="e-date">Tarih</label>
                <input id="e-date" className="input" type="date" value={editing.date ?? ''} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="e-kind">Tür</label>
                <select id="e-kind" className="select" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as EventKind })}>
                  {(Object.keys(eventLabel) as EventKind[]).map((k) => <option key={k} value={k}>{eventLabel[k]}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="e-game">Oyun</label>
              <select id="e-game" className="select" value={editing.game_id ?? ''} onChange={(e) => setEditing({ ...editing, game_id: e.target.value || null })}>
                <option value="">Genel</option>
                {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-note">Not</label>
              <textarea id="e-note" className="textarea" rows={2} value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
            <div className="flex between" style={{ gap: 8 }}>
              {editing.id ? (
                <button type="button" className="btn btn-red" onClick={async () => { await remove(editing.id!); setEditing(null); toast('Etkinlik silindi', 'info') }}>
                  <Trash2 size={13} /> Sil
                </button>
              ) : <span />}
              <div className="flex" style={{ gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Vazgeç</button>
                <button type="submit" className="btn btn-primary" disabled={!editing.title?.trim()}>Kaydet</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
