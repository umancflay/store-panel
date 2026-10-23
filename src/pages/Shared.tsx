import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Plus, Check, X as XIcon, HelpCircle } from 'lucide-react'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { supabase, isDemo } from '../lib/supabase'
import { useRows, addDays, daysBetween, today, trDate, trDateTime } from '../lib/rows'
import { demoDecisions, demoMessages, demoNodes, demoPlans, demoTasks, DEMO_PARTNER } from '../data/demo'
import { ASSISTANT, type Decision, type Message, type Plan, type PlanNode, type Task } from '../lib/types'
import { SampleBanner, initials, Seg } from '../components/ui'

const DAYS = 42
const laneColor = ['#FFFFFF', '#8FD3AE', '#E8C07A']
const voteText = { yes: 'Evet', no: 'Hayır', thinking: 'Düşünüyorum' } as const

// Ortak plan: iki kişi + asistanın iş zaman çizelgesi, kim çevrimiçi, ortak kararlar ve sohbet
export default function Shared() {
  const { people, me, partner, nameOf } = usePeople()
  const { toast } = useStore()
  const { rows: nodes } = useRows<PlanNode>('plan_nodes', demoNodes)
  const { rows: plans } = useRows<Plan>('plans', demoPlans)
  const { rows: tasks } = useRows<Task>('tasks', demoTasks)
  const msgs = useRows<Message>('messages', demoMessages, { order: 'created_at', filter: ['channel', 'plan'] })
  const decs = useRows<Decision>('decisions', demoDecisions, { order: 'created_at', ascending: false })
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [online, setOnline] = useState<string[]>(isDemo ? [DEMO_PARTNER] : [])
  const [text, setText] = useState('')
  const [question, setQuestion] = useState('')
  const chatBox = useRef<HTMLDivElement>(null)

  // Canlı: yeni mesajlar, karar oyları ve kim çevrimiçi
  useEffect(() => {
    if (isDemo || !supabase || !me.email) return
    const ch = supabase
      .channel('ortak-plan', { config: { presence: { key: me.email } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new as Message
        if (m.channel === 'plan') msgs.setRows((r) => (r.some((x) => x.id === m.id) ? r : [...r, m]))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'decisions' }, () => decs.reload())
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(ch.presenceState())))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') ch.track({ at: new Date().toISOString() })
      })
    return () => {
      supabase!.removeChannel(ch)
    }
  }, [me.email]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sohbet kutusunu en alta kaydır (sayfanın kendisi kaymaz)
  useEffect(() => {
    const el = chatBox.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs.rows.length])

  const lanes = [me.email, ...(partner ? [partner.email] : []), ASSISTANT]
  const start = (() => {
    const d = new Date(today() + 'T00:00:00')
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7) // geçen haftanın pazartesi
    return d.toISOString().slice(0, 10)
  })()
  const todayIdx = daysBetween(start, today())

  const shown = nodes.filter((n) => n.start_date && (planFilter === 'all' || String(n.plan_id) === planFilter))
  // Her şeridi üst üste binmeyecek satırlara böl
  const laneRows = useMemo(
    () =>
      lanes.map((who) => {
        const rows: PlanNode[][] = []
        const list = shown.filter((n) => (n.assignee ?? '') === who).sort((a, b) => a.start_date!.localeCompare(b.start_date!))
        for (const n of list) {
          const s = daysBetween(start, n.start_date!)
          const row = rows.find((r) => r.every((x) => daysBetween(start, x.start_date!) + x.duration_days <= s))
          if (row) row.push(n)
          else rows.push([n])
        }
        return rows
      }),
    [shown, lanes.join(), start], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const load = (who: string) => ({
    nodes: nodes.filter((n) => n.assignee === who && n.status !== 'done').length,
    tasks: tasks.filter((t) => t.assignee === who && t.status !== 'done').length,
  })
  const maxLoad = Math.max(1, ...lanes.map((w) => load(w).nodes + load(w).tasks))

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const t = text.trim()
    setText('')
    try {
      await msgs.insert({ channel: 'plan', author: me.email, text: t })
    } catch (err) {
      toast('Mesaj gönderilemedi: ' + (err as Error).message, 'warn')
      setText(t)
    }
  }

  async function vote(d: Decision, v: Decision['votes'][string]) {
    await decs.update(d.id, { votes: { ...d.votes, [me.email]: v } }).catch((e) => toast('Oy kaydedilemedi: ' + e.message, 'warn'))
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    try {
      await decs.insert({ question: question.trim(), votes: {}, status: 'open', created_by: me.email })
      setQuestion('')
    } catch (err) {
      toast('Karar eklenemedi: ' + (err as Error).message, 'warn')
    }
  }

  const partnerOnline = partner && online.some((o) => o.toLowerCase() === partner.email.toLowerCase())

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Ortak plan</span>
          <h1>Birlikte çalış</h1>
          <p>Kim neyle uğraşıyor, sırada ne var, hangi karar bekliyor — iki kişi ve asistan aynı ekranda.</p>
        </div>
        {partner ? (
          <span className="presence" style={{ color: partnerOnline ? undefined : 'var(--muted)' }}>
            <span className="dot" style={partnerOnline ? undefined : { background: '#555', boxShadow: 'none', animation: 'none' }} />
            {partner.name} {partnerOnline ? 'şu an panelde' : 'çevrimdışı'}
          </span>
        ) : (
          <span className="muted small">Ortak hesabı eklenince burada görünür.</span>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Zaman çizelgesi</div>
            <div className="card-sub">{trDate(start)} – {trDate(addDays(start, DAYS - 1))} · Plan adımları</div>
          </div>
          <select className="select" style={{ width: 'auto' }} value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Plan seç">
            <option value="all">Tüm planlar</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {shown.length === 0 ? (
          <div className="empty">Zaman çizelgesinde adım yok. <Link to="/plan" className="linkish">Plan sayfasında</Link> adım ekleyince burada görünür.</div>
        ) : (
          <div className="timeline">
            <div className="tl-grid" style={{ gridTemplateColumns: `120px repeat(${DAYS}, minmax(0, 1fr))` }}>
              <span />
              {Array.from({ length: DAYS / 7 }, (_, w) => (
                <span key={w} className="tl-week" style={{ gridColumn: `span 7` }}>{trDate(addDays(start, w * 7))}</span>
              ))}
              {lanes.map((who, li) =>
                (laneRows[li].length ? laneRows[li] : [[]]).map((row, ri) => (
                  <Lane key={who + ri} who={who} ri={ri} li={li} row={row} start={start} name={nameOf(who)} />
                )),
              )}
              {todayIdx >= 0 && todayIdx < DAYS && (
                <span className="tl-today" style={{ left: `calc(120px + (100% - 120px) * ${(todayIdx + 0.5) / DAYS})` }} title="Bugün" />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid g-3">
        <div className="card">
          <div className="card-title">İş yükü</div>
          <div className="card-sub">Açık plan adımı + görev</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {lanes.map((w, i) => {
              const l = load(w)
              return (
                <div key={w}>
                  <div className="flex between small" style={{ marginBottom: 6 }}>
                    <span>{nameOf(w)}</span>
                    <span className="muted">{l.nodes} adım · {l.tasks} görev</span>
                  </div>
                  <div className="bar"><i style={{ width: `${((l.nodes + l.tasks) / maxLoad) * 100}%`, background: laneColor[i] }} /></div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Ortak kararlar</div>
          <div className="card-sub">İkiniz de oy verince karar netleşir</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {decs.rows.filter((d) => d.status === 'open').length === 0 && <div className="muted small">Bekleyen karar yok.</div>}
            {decs.rows.filter((d) => d.status === 'open').map((d) => {
              const mine = d.votes[me.email]
              const all = people.map((p) => d.votes[p.email])
              const agreed = all.length > 1 && all.every((v) => v && v === all[0] && v !== 'thinking')
              return (
                <div key={d.id} className="inner" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>{d.question}</div>
                  <div className="flex wrap" style={{ gap: 6 }}>
                    {people.map((p) => (
                      <span key={p.email} className="chip">
                        {p.name}: {d.votes[p.email] ? voteText[d.votes[p.email]] : '—'}
                      </span>
                    ))}
                  </div>
                  <div className="flex wrap" style={{ gap: 6 }}>
                    <Seg
                      value={mine ?? ('' as never)}
                      options={[
                        { value: 'yes', label: 'Evet' },
                        { value: 'thinking', label: 'Düşünüyorum' },
                        { value: 'no', label: 'Hayır' },
                      ]}
                      onChange={(v) => vote(d, v)}
                    />
                    {agreed && (
                      <button type="button" className="btn sm btn-green" onClick={() => decs.update(d.id, { status: 'closed' })}>
                        <Check size={12} /> Kararı kapat ({voteText[all[0]!]})
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <form className="flex" style={{ gap: 6 }} onSubmit={ask}>
              <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Yeni karar sorusu" aria-label="Yeni karar" />
              <button type="submit" className="btn" disabled={!question.trim()}><Plus size={13} /></button>
            </form>
            {decs.rows.some((d) => d.status === 'closed') && (
              <details className="muted small">
                <summary style={{ cursor: 'pointer' }}>Kapanan kararlar</summary>
                {decs.rows.filter((d) => d.status === 'closed').map((d) => {
                  const v = Object.values(d.votes)[0]
                  return (
                    <div key={d.id} className="flex" style={{ gap: 6, padding: '6px 0' }}>
                      {v === 'yes' ? <Check size={12} color="var(--green)" /> : v === 'no' ? <XIcon size={12} color="var(--orange)" /> : <HelpCircle size={12} />}
                      {d.question}
                    </div>
                  )
                })}
              </details>
            )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-title">Plan sohbeti</div>
          <div className="card-sub">Canlı · ikiniz de görürsünüz</div>
          <div ref={chatBox} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
            {msgs.rows.length === 0 && <div className="muted small">Henüz mesaj yok.</div>}
            {msgs.rows.map((m) => (
              <div key={m.id} className="chat-msg">
                <span className={`avatar sm ${m.author === ASSISTANT ? 'ai' : m.author !== me.email ? 'alt' : ''}`}>{m.author === ASSISTANT ? 'AI' : initials(nameOf(m.author))}</span>
                <div className="bubble">
                  <small>{nameOf(m.author)} · {trDateTime(m.created_at)}</small>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <form className="chat-input" style={{ marginTop: 14 }} onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mesaj yaz" aria-label="Mesaj" />
            <button type="submit" className="btn btn-primary sm" disabled={!text.trim()} aria-label="Gönder"><Send size={13} /></button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Lane({ who, ri, li, row, start, name }: { who: string; ri: number; li: number; row: PlanNode[]; start: string; name: string }) {
  const color = laneColor[li] ?? '#fff'
  return (
    <>
      <div className="tl-lane" style={{ gridColumn: 1 }}>
        {ri === 0 && (
          <>
            <span className={`avatar sm ${who === ASSISTANT ? 'ai' : li === 1 ? 'alt' : ''}`}>{who === ASSISTANT ? 'AI' : initials(name)}</span>
            <span className="small">{name}</span>
          </>
        )}
      </div>
      <div style={{ gridColumn: `2 / span ${DAYS}`, position: 'relative', height: 38 }}>
        {row.map((n) => {
          const s = Math.max(0, daysBetween(start, n.start_date!))
          const e = Math.min(DAYS, daysBetween(start, n.start_date!) + n.duration_days)
          if (e <= 0 || s >= DAYS) return null
          return (
            <Link
              key={n.id}
              to="/plan"
              className="tl-bar"
              title={`${n.title} · ${trDate(n.start_date)} · ${n.duration_days} gün`}
              style={{
                position: 'absolute', left: `${(s / DAYS) * 100}%`, width: `calc(${((e - s) / DAYS) * 100}% - 3px)`,
                borderColor: n.status === 'active' ? color : 'rgba(255,255,255,.12)',
                background: n.status === 'done' ? 'rgba(255,255,255,.04)' : `linear-gradient(90deg, ${color}26, ${color}0a)`,
                color: n.status === 'done' ? 'var(--muted)' : '#fff',
                textDecoration: n.status === 'done' ? 'line-through' : undefined,
              }}
            >
              {n.status === 'active' && <span className="dot" style={{ background: color }} />}
              {n.title}
            </Link>
          )
        })}
      </div>
    </>
  )
}
