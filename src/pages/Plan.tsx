import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, X, ZoomIn, ZoomOut, ListTodo } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, addDays, daysBetween, today, trDate } from '../lib/rows'
import { demoNodes, demoPlans, demoTasks } from '../data/demo'
import { finishNode } from '../lib/planSync'
import { ASSISTANT, type NodeStatus, type Plan as PlanT, type PlanNode, type Task } from '../lib/types'
import { Modal, SampleBanner, initials, useIsMobile } from '../components/ui'
import Select from '../components/Select'

const W = 190
const H = 104
const GX = 250
const GY = 132
const statusText: Record<NodeStatus, string> = { wait: 'Bekliyor', active: 'Devam ediyor', done: 'Bitti' }
const tickColor: Record<NodeStatus, string> = { wait: 'rgba(255,255,255,.10)', active: '#8FD3AE', done: 'rgba(143,211,174,.45)' }
const templates = [
  { title: 'Tasarım', sub: 'Tasarım dokümanı', days: 3 },
  { title: 'Kod', sub: 'Unity · kod', days: 5 },
  { title: 'Sanat', sub: 'Görseller', days: 5 },
  { title: 'İç test', sub: 'Test oyuncuları', days: 3 },
  { title: 'Mağaza görselleri', sub: 'Ekran görüntüsü + video', days: 3 },
  { title: 'Yayın', sub: 'Play + App Store', days: 1 },
]

// Bağımlılığa göre otomatik yerleşim: her düğüm, bağlı olduğu en derin düğümün bir sağına
function layout(nodes: PlanNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depth = new Map<number, number>()
  const d = (n: PlanNode, seen = new Set<number>()): number => {
    if (depth.has(n.id)) return depth.get(n.id)!
    if (seen.has(n.id)) return 0 // döngü koruması
    seen.add(n.id)
    const deps = n.depends_on.map((id) => byId.get(id)).filter(Boolean) as PlanNode[]
    const v = deps.length ? Math.max(...deps.map((x) => d(x, seen))) + 1 : 0
    depth.set(n.id, v)
    return v
  }
  nodes.forEach((n) => d(n))
  const cols = new Map<number, PlanNode[]>()
  for (const n of [...nodes].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.id - b.id)) {
    const c = depth.get(n.id)!
    cols.set(c, [...(cols.get(c) ?? []), n])
  }
  const pos = new Map<number, { x: number; y: number }>()
  let maxRows = 1
  for (const [c, list] of cols) {
    maxRows = Math.max(maxRows, list.length)
    list.forEach((n, i) => pos.set(n.id, { x: 36 + c * GX, y: 36 + i * GY }))
  }
  const order = [...nodes].sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || (pos.get(a.id)!.y - pos.get(b.id)!.y))
  return { pos, order, width: 36 * 2 + (cols.size - 1) * GX + W, height: 36 * 2 + (maxRows - 1) * GY + H }
}

export default function Plan() {
  const { games } = useData()
  const { toast } = useStore()
  const { people, me, nameOf } = usePeople()
  const mobile = useIsMobile()
  const nav = useNavigate()
  const plans = useRows<PlanT>('plans', demoPlans)
  const nodesDb = useRows<PlanNode>('plan_nodes', demoNodes)
  const tasksDb = useRows<Task>('tasks', demoTasks)
  const [planId, setPlanId] = useState<number | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [newPlan, setNewPlan] = useState<Partial<PlanT> | null>(null)

  useEffect(() => {
    if (planId == null && plans.rows.length) setPlanId(plans.rows[0].id)
  }, [plans.rows, planId])

  const plan = plans.rows.find((p) => p.id === planId) ?? null
  const nodes = nodesDb.rows.filter((n) => n.plan_id === planId)
  const { pos, order, width, height } = useMemo(() => layout(nodes), [nodes])
  const selected = nodes.find((n) => n.id === sel) ?? null
  const done = nodes.filter((n) => n.status === 'done').length
  const left = plan?.target_date ? daysBetween(today(), plan.target_date) : null

  async function patch(n: PlanNode, p: Partial<PlanNode>) {
    try {
      await nodesDb.update(n.id, p)
      if (p.status === 'done') {
        // Sıradaki adımlar kendiliğinden başlar, bu adıma bağlı görev de biter
        const started = await finishNode(nodesDb.rows, n.id, nodesDb.update)
        if (started.length) toast(`Sıradaki adım başladı: ${started.join(', ')}`)
        const task = tasksDb.rows.find((t) => t.plan_node_id === n.id && t.status !== 'done')
        if (task) await tasksDb.update(task.id, { status: 'done', history: [...task.history, { what: 'Plan adımı bitti, otomatik kapandı', at: new Date().toISOString() }] })
      }
    } catch (e) {
      toast('Kaydedilemedi: ' + (e as Error).message, 'warn')
    }
  }

  async function addNode(t: (typeof templates)[number] | null) {
    if (!plan) return
    const after = selected
    const start = after ? addDays(after.start_date ?? today(), after.duration_days) : today()
    try {
      const n = await nodesDb.insert({
        plan_id: plan.id, title: t?.title ?? 'Yeni adım', sub: t?.sub ?? null, status: after && after.status !== 'done' ? 'wait' : 'active',
        assignee: me.email, start_date: start, duration_days: t?.days ?? 2, depends_on: after ? [after.id] : [],
      })
      setSel(n.id)
    } catch (e) {
      toast('Eklenemedi: ' + (e as Error).message, 'warn')
    }
  }

  async function delNode(n: PlanNode) {
    if (!window.confirm(`"${n.title}" silinsin mi?`)) return
    setSel(null)
    // Bu adıma bağlı olanlardan bağı kaldır
    for (const x of nodes.filter((x) => x.depends_on.includes(n.id))) await nodesDb.update(x.id, { depends_on: x.depends_on.filter((id) => id !== n.id) })
    await nodesDb.remove(n.id).catch((e) => toast('Silinemedi: ' + e.message, 'warn'))
  }

  async function openTask(n: PlanNode) {
    const existing = tasksDb.rows.find((t) => t.plan_node_id === n.id)
    if (existing) return nav(`/gorevler?id=${existing.id}`)
    try {
      const t = await tasksDb.insert({
        title: n.title, status: n.status === 'done' ? 'done' : n.status === 'active' ? 'doing' : 'open', level: 'medium', game_id: plan?.game_id ?? null,
        assignee: n.assignee, due_date: n.start_date ? addDays(n.start_date, n.duration_days) : null, tags: [plan?.name ?? 'Plan'], subtasks: [],
        plan_node_id: n.id, created_by: me.email, source: `plan:${n.id}`, history: [{ what: 'Plandan oluşturuldu', at: new Date().toISOString() }],
      })
      nav(`/gorevler?id=${t.id}`)
    } catch (e) {
      toast('Görev oluşturulamadı: ' + (e as Error).message, 'warn')
    }
  }

  async function savePlan() {
    if (!newPlan?.name?.trim()) return
    try {
      const p = await plans.insert({ name: newPlan.name.trim(), target_date: newPlan.target_date || null, game_id: newPlan.game_id || null })
      setPlanId(p.id)
      setNewPlan(null)
      toast('Plan oluşturuldu')
    } catch (e) {
      toast('Plan oluşturulamadı: ' + (e as Error).message, 'warn')
    }
  }

  async function delPlan() {
    if (!plan || !window.confirm(`"${plan.name}" planı ve tüm adımları silinsin mi?`)) return
    await plans.remove(plan.id).catch((e) => toast('Silinemedi: ' + e.message, 'warn'))
    nodesDb.setRows((r) => r.filter((n) => n.plan_id !== plan.id))
    setPlanId(null)
  }

  // Bir düğümün kendisi ve ona bağlı olanlar bağımlılık olarak seçilemez (döngü olmasın)
  const descendants = (id: number): Set<number> => {
    const out = new Set<number>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const n of nodes) if (!out.has(n.id) && n.depends_on.some((d) => out.has(d))) { out.add(n.id); grew = true }
    }
    return out
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Plan</span>
          <h1>Çalışma sırası</h1>
          <p>Adımları bağla; biri bitince sıradaki kendiliğinden başlar.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setNewPlan({ name: '', target_date: addDays(today(), 30) })}><Plus size={15} /> Yeni plan</button>
      </div>

      <div className="flex wrap" style={{ gap: 8 }}>
        {plans.rows.map((p) => (
          <button key={p.id} type="button" className={`btn ${p.id === planId ? 'btn-primary' : 'btn-ghost'} sm`} onClick={() => { setPlanId(p.id); setSel(null) }}>{p.name}</button>
        ))}
      </div>

      {!plan ? (
        <div className="card"><div className="empty">Henüz plan yok. “Yeni plan” ile bir sürüm ya da güncelleme planı oluştur.</div></div>
      ) : (
        <>
          <div className="grid g-4">
            <div className="card tile"><span className="stat-label">Hedef tarih</span><div className="stat-value" style={{ fontSize: 22 }}>{trDate(plan.target_date, true)}</div></div>
            <div className="card tile"><span className="stat-label">Kalan</span><div className="stat-value" style={{ fontSize: 22, color: left != null && left < 0 ? 'var(--orange)' : undefined }}>{left == null ? '—' : left < 0 ? `${-left} gün geçti` : `${left} gün`}</div></div>
            <div className="card tile"><span className="stat-label">İlerleme</span><div className="stat-value" style={{ fontSize: 22 }}>{nodes.length ? `%${Math.round((done / nodes.length) * 100)}` : '—'}</div></div>
            <div className="card tile">
              <span className="stat-label">Adımlar · {done}/{nodes.length}</span>
              <div className="ticks" style={{ marginTop: 10 }}>{order.map((n) => <span key={n.id} style={{ background: tickColor[n.status] }} title={n.title} />)}</div>
            </div>
          </div>

          <div className="flex wrap between" style={{ gap: 8 }}>
            <div className="flex wrap" style={{ gap: 6 }}>
              <span className="muted small" style={{ alignSelf: 'center' }}>{selected ? `“${selected.title}” sonrasına ekle:` : 'Adım ekle:'}</span>
              {templates.map((t) => <button key={t.title} type="button" className="btn sm" onClick={() => addNode(t)}><Plus size={11} /> {t.title}</button>)}
              <button type="button" className="btn sm" onClick={() => addNode(null)}><Plus size={11} /> Boş adım</button>
            </div>
            <div className="flex" style={{ gap: 6 }}>
              <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} aria-label="Uzaklaş"><ZoomOut size={14} /></button>
              <span className="muted small" style={{ alignSelf: 'center', width: 36, textAlign: 'center' }}>%{Math.round(zoom * 100)}</span>
              <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)))} aria-label="Yakınlaş"><ZoomIn size={14} /></button>
              <button type="button" className="icon-btn" onClick={delPlan} aria-label="Planı sil" title="Planı sil"><Trash2 size={14} /></button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selected && !mobile ? 'minmax(0, 1fr) 320px' : '1fr', gap: 14, alignItems: 'start' }}>
            <div className="plan-canvas" onClick={() => setSel(null)}>
              {nodes.length === 0 ? (
                <div className="empty" style={{ position: 'relative' }}>Bu planda adım yok. Yukarıdan bir adım ekle.</div>
              ) : (
                <div style={{ position: 'relative', width: width * zoom, height: height * zoom }}>
                  <div style={{ position: 'absolute', inset: 0, width, height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }} aria-hidden>
                      {nodes.flatMap((n) =>
                        n.depends_on.map((d) => {
                          const a = pos.get(d)
                          const b = pos.get(n.id)
                          if (!a || !b) return null
                          const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2
                          const dep = nodes.find((x) => x.id === d)
                          const ok = dep?.status === 'done'
                          return (
                            <path key={`${d}-${n.id}`} d={`M${x1} ${y1} C${x1 + 40} ${y1} ${x2 - 40} ${y2} ${x2} ${y2}`} fill="none"
                              stroke={ok ? '#8FD3AE' : 'rgba(255,255,255,.28)'} strokeWidth={ok ? 1.6 : 1.2} strokeDasharray={ok ? undefined : '4 4'} />
                          )
                        }),
                      )}
                    </svg>
                    {order.map((n, i) => {
                      const p = pos.get(n.id)!
                      return (
                        <button
                          key={n.id}
                          type="button"
                          className={`pnode ${n.status} ${sel === n.id ? 'sel' : ''}`}
                          style={{ left: p.x, top: p.y, height: H }}
                          onClick={(e) => { e.stopPropagation(); setSel(n.id === sel ? null : n.id) }}
                        >
                          <span className="order-badge">{i + 1}</span>
                          <div className="pnode-top">
                            <span className="ptile">{n.assignee === ASSISTANT ? 'AI' : initials(nameOf(n.assignee))}</span>
                            <div style={{ minWidth: 0 }}>
                              <div className="pnode-title">{n.title}</div>
                              {n.sub && <div className="pnode-sub">{n.sub}</div>}
                            </div>
                          </div>
                          <div className="pnode-foot">
                            <span>{statusText[n.status]}</span>
                            <span>{n.start_date ? trDate(n.start_date) : ''} · {n.duration_days} gün</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {selected && (
              <aside className="detail fade-in">
                <div className="flex between">
                  <span className="card-sub">Adım ayrıntısı</span>
                  <div className="flex" style={{ gap: 6 }}>
                    <button type="button" className="icon-btn" onClick={() => delNode(selected)} aria-label="Adımı sil"><Trash2 size={14} /></button>
                    <button type="button" className="icon-btn" onClick={() => setSel(null)} aria-label="Kapat"><X size={14} /></button>
                  </div>
                </div>
                <input className="editor-title" style={{ fontSize: 18 }} defaultValue={selected.title} key={'t' + selected.id} onBlur={(e) => e.target.value.trim() && e.target.value !== selected.title && patch(selected, { title: e.target.value.trim() })} aria-label="Adım adı" />
                <div className="kv">
                  <span>Açıklama</span>
                  <input className="input" defaultValue={selected.sub ?? ''} key={'s' + selected.id} onBlur={(e) => e.target.value !== (selected.sub ?? '') && patch(selected, { sub: e.target.value || null })} />
                  <span>Durum</span>
                  <Select className="select" value={selected.status} onChange={(e) => patch(selected, { status: e.target.value as NodeStatus })}>
                    {(['wait', 'active', 'done'] as const).map((s) => <option key={s} value={s}>{statusText[s]}</option>)}
                  </Select>
                  <span>Sorumlu</span>
                  <Select className="select" value={selected.assignee ?? ''} onChange={(e) => patch(selected, { assignee: e.target.value || null })}>
                    {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                    <option value={ASSISTANT}>Asistan</option>
                  </Select>
                  <span>Başlangıç</span>
                  <input className="input" type="date" value={selected.start_date ?? ''} onChange={(e) => patch(selected, { start_date: e.target.value || null })} />
                  <span>Süre (gün)</span>
                  <input className="input" type="number" min={1} max={90} value={selected.duration_days} onChange={(e) => patch(selected, { duration_days: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
                <div>
                  <div className="card-sub" style={{ marginBottom: 8 }}>Önce bitmesi gerekenler</div>
                  {(() => {
                    const blocked = descendants(selected.id)
                    const options = nodes.filter((n) => !blocked.has(n.id))
                    if (!options.length) return <div className="muted small">Seçilebilecek adım yok.</div>
                    return options.map((n) => (
                      <label key={n.id} className="check" style={{ padding: '4px 0' }}>
                        <input
                          type="checkbox"
                          checked={selected.depends_on.includes(n.id)}
                          onChange={(e) => patch(selected, { depends_on: e.target.checked ? [...selected.depends_on, n.id] : selected.depends_on.filter((x) => x !== n.id) })}
                        />
                        <span className="box" style={{ background: selected.depends_on.includes(n.id) ? 'var(--green)' : undefined, borderColor: selected.depends_on.includes(n.id) ? 'var(--green)' : undefined }}>✓</span>
                        <span>{n.title}</span>
                      </label>
                    ))
                  })()}
                </div>
                <div className="flex wrap" style={{ gap: 8 }}>
                  {selected.status !== 'done' && <button type="button" className="btn btn-green" onClick={() => patch(selected, { status: 'done' })}>Bitti olarak işaretle</button>}
                  <button type="button" className="btn" onClick={() => openTask(selected)}><ListTodo size={13} /> Görevlerde aç</button>
                </div>
              </aside>
            )}
          </div>
        </>
      )}

      {newPlan && (
        <Modal title="Yeni plan" onClose={() => setNewPlan(null)}>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={(e) => { e.preventDefault(); savePlan() }}>
            <div className="field">
              <label htmlFor="p-name">Plan adı</label>
              <input id="p-name" className="input" autoFocus placeholder="ör. Salgın 1.2" value={newPlan.name ?? ''} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} />
            </div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field">
                <label htmlFor="p-date">Hedef yayın tarihi</label>
                <input id="p-date" className="input" type="date" value={newPlan.target_date ?? ''} onChange={(e) => setNewPlan({ ...newPlan, target_date: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="p-game">Oyun</label>
                <Select id="p-game" className="select" value={newPlan.game_id ?? ''} onChange={(e) => setNewPlan({ ...newPlan, game_id: e.target.value || null })}>
                  <option value="">Genel</option>
                  {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setNewPlan(null)}>Vazgeç</button>
              <button type="submit" className="btn btn-primary" disabled={!newPlan.name?.trim()}>Oluştur</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
