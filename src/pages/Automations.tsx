import { useEffect, useState } from 'react'
import { Plus, Trash2, Play, Zap } from 'lucide-react'
import { useData } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, trDateTime } from '../lib/rows'
import { demoAutomations } from '../data/demo'
import type { Automation, Trigger } from '../lib/types'
import { periodRows, totals } from '../lib/metrics'
import { pct } from '../lib/format'
import { SampleBanner, Toggle, useIsMobile } from '../components/ui'

// Tetikleyiciler: ne zaman çalışır, eşik ne demek
const triggers: Record<Trigger, { label: string; cond: (t: number | null) => string; unit?: string; def: number | null; phase?: number }> = {
  crash_rate: { label: 'Çökme oranı', cond: (t) => `7 günlük çökme oranı %${t ?? 1.09} üstünde`, unit: '%', def: 1.09 },
  anr_rate: { label: 'ANR oranı', cond: (t) => `7 günlük ANR oranı %${t ?? 0.47} üstünde`, unit: '%', def: 0.47 },
  rating: { label: 'Mağaza puanı', cond: (t) => `Puan ${t ?? 4} altında`, unit: '★', def: 4 },
  fill_rate: { label: 'AdMob fill rate', cond: (t) => `Fill rate %${t ?? 85} altında`, unit: '%', def: 85 },
  rejected: { label: 'Sürüm reddedildi', cond: () => 'App Store / Play incelemesi reddedildi', def: null },
  policy_mail: { label: 'Politika e-postası', cond: () => 'Google / Apple’dan politika e-postası geldi', def: null, phase: 4 },
  bad_review: { label: 'Kötü yorum', cond: (t) => `${t ?? 2} yıldız ve altı yorum geldi`, unit: '★', def: 2, phase: 4 },
  weekly_report: { label: 'Haftalık rapor', cond: () => 'Her pazartesi sabahı', def: null, phase: 4 },
}
const actionLabels: Record<string, string> = { task: 'Görev oluştur', notify: 'Telefona bildirim', summary: 'Günlük özete ekle', reply_draft: 'Cevap taslağı yaz' }

// Otomasyonlar: veri toplama (GitHub Actions) her çalıştığında bu kuralları uygular.
// Hiçbiri para harcamaz ya da mağazada bir şey değiştirmez; sadece görev/bildirim/taslak üretir.
export default function Automations() {
  const { rows, insert, update, remove } = useRows<Automation>('automations', demoAutomations)
  const { daily, builds, games } = useData()
  const { toast } = useStore()
  const [selId, setSelId] = useState<number | null>(null)
  const sel = rows.find((r) => r.id === selId) ?? rows[0] ?? null
  const [draft, setDraft] = useState<Automation | null>(sel)
  const [test, setTest] = useState<string[] | null>(null)
  const mobile = useIsMobile()

  useEffect(() => {
    setDraft(sel)
    setTest(null)
  }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = draft && sel && JSON.stringify(draft) !== JSON.stringify(sel)
  const tr = draft ? triggers[draft.trigger] : null

  async function save() {
    if (!draft || !sel) return
    const { id, runs, last_run_at, ...patch } = draft
    void runs, last_run_at
    try {
      await update(id, patch)
      toast('Kural kaydedildi')
    } catch (e) {
      toast('Kaydedilemedi: ' + (e as Error).message, 'warn')
    }
  }

  async function add() {
    try {
      const a = await insert({ name: 'Yeni kural', enabled: false, trigger: 'crash_rate', threshold: 1.09, actions: ['task'], runs: 0, last_run_at: null })
      setSelId(a.id)
    } catch (e) {
      toast('Eklenemedi: ' + (e as Error).message, 'warn')
    }
  }

  async function del() {
    if (!sel || !window.confirm(`"${sel.name}" silinsin mi?`)) return
    await remove(sel.id).catch((e) => toast('Silinemedi: ' + e.message, 'warn'))
    setSelId(null)
  }

  // "Test et": kuralı şimdiki verilere uygular, ne olacağını gösterir (hiçbir şey oluşturmaz)
  function runTest() {
    if (!draft) return
    const hits: string[] = []
    for (const g of games) {
      const t = totals(periodRows(daily, 7, (r) => r.gameId === g.id).cur)
      const th = draft.threshold ?? tr?.def ?? 0
      if (draft.trigger === 'crash_rate' && t.crashRate != null && t.crashRate > th) hits.push(`${g.name}: çökme ${pct(t.crashRate, 2)}`)
      if (draft.trigger === 'anr_rate' && t.anrRate != null && t.anrRate > th) hits.push(`${g.name}: ANR ${pct(t.anrRate, 2)}`)
      if (draft.trigger === 'rating' && t.rating != null && t.rating < th) hits.push(`${g.name}: puan ${t.rating.toFixed(1)}`)
      if (draft.trigger === 'fill_rate' && t.requests > 100 && t.fillRate < th) hits.push(`${g.name}: fill rate ${pct(t.fillRate, 0)}`)
    }
    if (draft.trigger === 'rejected') for (const b of builds) if (/Reddedildi|Geçersiz/.test(b.status)) hits.push(`${games.find((g) => g.id === b.gameId)?.name ?? b.gameId} ${b.version}: ${b.status}`)
    setTest(tr?.phase ? [`Bu tetikleyici ${tr.phase}. aşamada çalışmaya başlayacak.`] : hits)
  }

  const set = (p: Partial<Automation>) => draft && setDraft({ ...draft, ...p })

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Otomasyon</span>
          <h1>Kurallar</h1>
          <p>Veri her toplandığında bu kurallar kontrol edilir. Kurallar sadece görev, bildirim ve taslak üretir; para harcamaz, mağazada bir şey değiştirmez.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={add}><Plus size={15} /> Yeni kural</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: mobile ? '1fr' : '300px minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card" style={{ padding: 10 }}>
          {rows.length === 0 && <div className="empty">Kural yok. Veritabanı kurulumu (features.sql) başlangıç kurallarını ekler.</div>}
          {rows.map((r) => (
            <button key={r.id} type="button" className={`rule-item ${sel?.id === r.id ? 'on' : ''}`} onClick={() => setSelId(r.id)}>
              <span className="dot" style={{ background: r.enabled ? 'var(--green)' : '#555', boxShadow: r.enabled ? '0 0 8px var(--green)' : undefined }} />
              <span className="grow">
                {r.name}
                <small style={{ display: 'block' }}>{r.runs} kez çalıştı{r.last_run_at ? ` · son ${trDateTime(r.last_run_at)}` : ''}</small>
              </span>
            </button>
          ))}
        </div>

        {draft && tr && (
          <div className="card" style={{ minWidth: 0 }}>
            <div className="flex between wrap" style={{ gap: 10 }}>
              <input className="editor-title" style={{ fontSize: 20, flex: 1, minWidth: 200 }} value={draft.name} onChange={(e) => set({ name: e.target.value })} aria-label="Kural adı" />
              <div className="flex" style={{ gap: 8 }}>
                <span className="muted small">{draft.enabled ? 'Açık' : 'Kapalı'}</span>
                <Toggle on={draft.enabled} onChange={(v) => set({ enabled: v })} label="Kural açık" />
              </div>
            </div>

            <div className="grid g-2" style={{ gap: 12, marginTop: 14 }}>
              <div className="field">
                <label htmlFor="a-trig">Ne zaman</label>
                <select id="a-trig" className="select" value={draft.trigger} onChange={(e) => { const t = e.target.value as Trigger; set({ trigger: t, threshold: triggers[t].def }) }}>
                  {(Object.keys(triggers) as Trigger[]).map((k) => <option key={k} value={k}>{triggers[k].label}{triggers[k].phase ? ` (${triggers[k].phase}. aşama)` : ''}</option>)}
                </select>
              </div>
              {tr.def != null && (
                <div className="field">
                  <label htmlFor="a-th">Eşik {tr.unit ? `(${tr.unit})` : ''}</label>
                  <input id="a-th" className="input" type="number" step="0.01" value={draft.threshold ?? ''} onChange={(e) => set({ threshold: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
              )}
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Ne yapsın</label>
              <div className="flex wrap" style={{ gap: 8 }}>
                {Object.entries(actionLabels).map(([k, l]) => {
                  const on = draft.actions.includes(k)
                  return (
                    <button key={k} type="button" className={`btn sm ${on ? 'btn-green' : 'btn-ghost'}`} aria-pressed={on} onClick={() => set({ actions: on ? draft.actions.filter((x) => x !== k) : [...draft.actions, k] })}>
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flowchart">
              <div className="fc-node trigger"><Zap size={14} /> {tr.label}</div>
              <div className="fc-line" />
              <div className="fc-node cond">{tr.cond(draft.threshold)}</div>
              <div className="fc-line" />
              <span className="fc-label">ise</span>
              <div className="fc-line" />
              <div className="fc-branch">
                {draft.actions.length === 0 && <div className="fc-node" style={{ color: 'var(--muted)' }}>Eylem seçilmedi</div>}
                {draft.actions.map((a) => <div key={a} className="fc-node act">{actionLabels[a] ?? a}</div>)}
              </div>
              <div className="fc-line" />
              <div className="fc-node end">Onayın olmadan mağazada hiçbir şey değişmez</div>
            </div>

            {test && (
              <div className="inner fade-in" style={{ fontSize: 12, lineHeight: 1.6 }}>
                <b style={{ fontWeight: 500 }}>Test sonucu (şimdiki veriyle):</b>
                {test.length === 0 ? <div className="muted">Şu an tetiklenmez — eşiği aşan oyun yok.</div> : test.map((h) => <div key={h}>• {h}</div>)}
              </div>
            )}

            <div className="flex between wrap" style={{ gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-red" onClick={del}><Trash2 size={13} /> Sil</button>
              <div className="flex" style={{ gap: 8 }}>
                <button type="button" className="btn" onClick={runTest}><Play size={13} /> Test et</button>
                <button type="button" className="btn btn-primary" disabled={!dirty} onClick={save}>Kaydet</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
