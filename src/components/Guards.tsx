import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, TrendingDown } from 'lucide-react'
import { useData } from '../lib/data'
import { useSetting } from '../lib/rows'
import { useStore } from '../lib/store'
import { supabase, isDemo } from '../lib/supabase'
import { localIso, money } from '../lib/format'
import { GameLogo, Toggle } from './ui'

// Korumalar (scripts/guards.mjs her sabah bakar): sadece uyarı ve telefona bildirim; kampanya durdurmaz, bütçe değiştirmez.
// Ayarlar app_settings.guards'ta: eCPM alarmı Gelir sayfasında, bütçe bekçisi Reklam sayfasında.

type GuardCfg = { ecpm: { enabled: boolean; drop: number; minImpressions: number }; budget: { enabled: boolean; monthly: number | null; spike: number } }
const DEFAULT: GuardCfg = { ecpm: { enabled: true, drop: 30, minImpressions: 500 }, budget: { enabled: true, monthly: null, spike: 2 } }
const usd = (v: number) => `$${v.toFixed(v >= 100 ? 0 : 2).replace('.', ',')}`

function useGuards() {
  const [raw, save] = useSetting<GuardCfg>('guards', DEFAULT)
  const cfg: GuardCfg = { ecpm: { ...DEFAULT.ecpm, ...raw.ecpm }, budget: { ...DEFAULT.budget, ...raw.budget } }
  const { toast } = useStore()
  const set = async (p: { ecpm?: Partial<GuardCfg['ecpm']>; budget?: Partial<GuardCfg['budget']> }, msg = 'Kaydedildi') => {
    try {
      await save({ ecpm: { ...cfg.ecpm, ...p.ecpm }, budget: { ...cfg.budget, ...p.budget } })
      toast(msg)
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }
  return [cfg, set] as const
}

// Reklam sayfası: aylık sınır, bu ay harcanan, ay sonu tahmini, ani artış uyarısı
export function BudgetGuard() {
  const [cfg, set] = useGuards()
  const [rows, setRows] = useState<{ date: string; spend: number }[] | null>(isDemo ? Array.from({ length: 12 }, (_, i) => ({ date: localIso(new Date(Date.now() - i * 86400000)), spend: 6 })) : null)
  const [limit, setLimit] = useState('')
  useEffect(() => setLimit(cfg.budget.monthly ? String(cfg.budget.monthly) : ''), [cfg.budget.monthly])
  useEffect(() => {
    if (isDemo) return
    supabase!.from('campaigns').select('date,spend').gte('date', localIso(new Date(Date.now() - 40 * 86400000))).limit(20000)
      .then(({ data }) => setRows((data as { date: string; spend: number }[]) ?? []))
  }, [])

  const st = useMemo(() => {
    const month = localIso(new Date()).slice(0, 7)
    const byDay = new Map<string, number>()
    for (const r of rows ?? []) byDay.set(r.date, (byDay.get(r.date) ?? 0) + Number(r.spend))
    const spent = [...byDay].filter(([d]) => d.startsWith(month)).reduce((a, [, v]) => a + v, 0)
    const recent = [1, 2, 3, 4, 5, 6, 7].reduce((a, n) => a + (byDay.get(localIso(new Date(Date.now() - n * 86400000))) ?? 0), 0) / 7
    const now = new Date()
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1
    return { spent, recent, forecast: spent + recent * daysLeft }
  }, [rows])

  const lim = cfg.budget.monthly
  const used = lim ? Math.min(100, (st.spent / lim) * 100) : 0
  const tone = !lim ? '' : st.spent >= lim ? 'bad' : used >= 80 || st.forecast > lim * 1.05 ? 'warn' : 'ok'
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><ShieldCheck size={16} /> Bütçe bekçisi</div>
          <div className="card-sub">Tüm reklam platformları toplamı · dolar</div>
        </div>
        <Toggle on={cfg.budget.enabled} onChange={(v) => set({ budget: { enabled: v } }, v ? 'Bütçe bekçisi açık' : 'Bütçe bekçisi kapalı')} label="Bütçe bekçisi" />
      </div>
      <div className="guard-stats">
        <div><span>Bu ay harcanan</span><b>{usd(st.spent)}</b></div>
        <div><span>Ay sonu tahmini</span><b className={tone === 'ok' ? '' : tone}>{usd(st.forecast)}</b></div>
        <div><span>Günlük ortalama</span><b>{usd(st.recent)}</b></div>
      </div>
      {lim ? <div className={`guard-bar ${tone}`}><span style={{ width: `${used}%` }} /></div> : null}
      <form className="flex wrap" style={{ gap: 8, marginTop: 12, alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); const v = Number(limit.replace(',', '.')); set({ budget: { monthly: v > 0 ? v : null } }, v > 0 ? `Aylık sınır ${usd(v)}` : 'Sınır kaldırıldı') }}>
        <span className="small muted">Aylık sınır $</span>
        <input className="input sm" style={{ width: 100 }} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="ör. 100" />
        <button type="submit" className="btn sm">Kaydet</button>
      </form>
      <div className="flex wrap" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
        <span className="small muted">Bir günde normalin kaç katı harcanırsa haber ver:</span>
        <div className="seg">
          {[0, 2, 3].map((k) => <button key={k} type="button" className={cfg.budget.spike === k ? 'on' : ''} onClick={() => set({ budget: { spike: k } })}>{k ? `${k} kat` : 'Kapalı'}</button>)}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
        Sınırın %80'ine gelince, dolunca ya da bu hızla aşılacaksa; ve bir günde normalin {cfg.budget.spike || 'N'} katı harcanırsa telefonuna bildirim gelir. Kampanyaları panel durdurmaz, sen durdurursun.
      </p>
    </section>
  )
}

// Gelir sayfası: oyun başına dünkü eCPM, son 14 günün ortalaması ve düşüş eşiği
export function EcpmGuard() {
  const [cfg, set] = useGuards()
  const { daily, games } = useData()
  const list = useMemo(() => {
    const y = localIso(new Date(Date.now() - 86400000))
    const from = localIso(new Date(Date.now() - 15 * 86400000))
    return games.map((g) => {
      let yi = 0, yr = 0, bi = 0, br = 0
      for (const r of daily) {
        if (r.gameId !== g.id || r.date < from || r.date > y) continue
        if (r.date === y) { yi += r.impressions; yr += r.adRevenue } else { bi += r.impressions; br += r.adRevenue }
      }
      const now = yi ? (yr / yi) * 1000 : null
      const base = bi ? (br / bi) * 1000 : null
      const pct = now != null && base ? Math.round(((now - base) / base) * 100) : null
      return { g, now, base, pct, ok: yi >= cfg.ecpm.minImpressions }
    }).filter((x) => x.base != null).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
  }, [daily, games, cfg.ecpm.minImpressions])

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><TrendingDown size={16} /> eCPM alarmı</div>
          <div className="card-sub">1000 gösterim başına kazanç: dün ve son 14 günün ortalaması</div>
        </div>
        <Toggle on={cfg.ecpm.enabled} onChange={(v) => set({ ecpm: { enabled: v } }, v ? 'eCPM alarmı açık' : 'eCPM alarmı kapalı')} label="eCPM alarmı" />
      </div>
      {list.length === 0 ? <div className="empty small">Son 14 günde reklam gösterimi yok.</div> : (
        <div className="profit-list">
          {list.map(({ g, now, base, pct, ok }) => {
            const alarm = ok && pct != null && -pct >= cfg.ecpm.drop
            return (
              <div key={g.id} className="profit-row">
                <GameLogo id={g.id} size={28} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b>{g.name}</b>
                  <div className="muted small">Dün {now != null ? money(now) : '—'} · normalde {money(base!)}{!ok && now != null ? ' · az gösterim' : ''}</div>
                </div>
                {pct != null && <span className={`badge ${alarm ? 'b-critical' : pct < -10 ? 'b-warning' : 'b-ok'}`}>{pct > 0 ? '+' : ''}{pct}%</span>}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex wrap" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
        <span className="small muted">Şu kadar düşerse haber ver:</span>
        <div className="seg">
          {[20, 30, 50].map((k) => <button key={k} type="button" className={cfg.ecpm.drop === k ? 'on' : ''} onClick={() => set({ ecpm: { drop: k } })}>%{k}</button>)}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
        Her sabah bakılır; düşüş olursa hangi reklam türünün düştüğüyle birlikte uyarı ve telefon bildirimi gelir. Günde {cfg.ecpm.minImpressions}'den az gösterimi olan oyunlarda alarm çalmaz.
      </p>
    </section>
  )
}
