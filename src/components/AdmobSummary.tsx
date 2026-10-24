import { isoDay, type DailyRow } from '../data/sample'
import { useData } from '../lib/data'
import { byDay, periodRows, totals } from '../lib/metrics'
import { int, money2, pct } from '../lib/format'
import { curvePath, GameLogo } from './ui'

// AdMob ana sayfasındaki özetin aynısı: bugün / dün / bu ay / geçen ay,
// son 7 gün ile önceki 7 günün karşılaştırması ve uygulama performansı.

const sum = (rows: DailyRow[]) => rows.reduce((a, r) => a + r.adRevenue, 0)

function monthBounds() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { thisStart: iso(new Date(y, m, 1)), prevStart: iso(new Date(y, m - 1, 1)) }
}

// İki dönemin günlük eğrisi: koyu çizgi bu hafta, soluk çizgi önceki hafta
function Compare({ cur, prev }: { cur: number[]; prev: number[] }) {
  if (cur.length < 2) return null
  const all = [...cur, ...prev]
  const max = Math.max(...all, 0.0001)
  const scale = (v: number[]) => v.map((x) => (x / max) * 100)
  return (
    <svg width="74" height="40" viewBox="0 0 74 40" aria-hidden style={{ flexShrink: 0 }}>
      {prev.length > 1 && <path d={curvePath(scale(prev), 74, 40, 4)} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.3" />}
      <path d={curvePath(scale(cur), 74, 40, 4)} fill="none" stroke="#8FD3AE" strokeWidth="1.6" />
    </svg>
  )
}

function Diff({ cur, prev, fmt, invert = false }: { cur: number; prev: number; fmt: (v: number) => string; invert?: boolean }) {
  const d = cur - prev
  if (!prev && !cur) return <span className="muted small">—</span>
  const p = prev ? (d / prev) * 100 : 0
  const good = invert ? d <= 0 : d >= 0
  return (
    <span className="small" style={{ color: good ? 'var(--green)' : 'var(--orange)' }}>
      {d >= 0 ? '+' : '−'}{fmt(Math.abs(d))}{prev ? ` (${d >= 0 ? '+' : '−'}%${Math.abs(p).toFixed(2).replace('.', ',')})` : ''}
    </span>
  )
}

export default function AdmobSummary() {
  const { daily, today, games } = useData()
  const { thisStart, prevStart } = monthBounds()
  const yesterday = isoDay(1)
  const tiles = [
    { label: 'Bugün şimdiye kadar', value: sum(today) },
    { label: 'Dün', value: sum(daily.filter((r) => r.date === yesterday)) },
    { label: 'Bu ay şimdiye kadar', value: sum(daily.filter((r) => r.date >= thisStart)) + sum(today) },
    { label: 'Geçen ay', value: sum(daily.filter((r) => r.date >= prevStart && r.date < thisStart)) },
  ]

  const { cur, prev } = periodRows(daily, 7)
  const t = totals(cur)
  const p = totals(prev)
  const dc = byDay(cur)
  const dp = byDay(prev)
  const series = (f: (d: (typeof dc)[number]) => number): [number[], number[]] => [dc.map(f), dp.map(f)]
  // İstek sayısı byDay'de yok: günlük isteği ham satırlardan hesapla
  const reqDays = (rows: DailyRow[]) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + r.requests)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }
  const metrics: { label: string; cur: number; prev: number; fmt: (v: number) => string; s: [number[], number[]] | null }[] = [
    { label: 'Tahmini kazanç', cur: t.adRevenue, prev: p.adRevenue, fmt: money2, s: series((d) => d.ad) },
    { label: 'İstekler', cur: t.requests, prev: p.requests, fmt: int, s: [reqDays(cur), reqDays(prev)] },
    { label: 'Gösterimler', cur: t.impressions, prev: p.impressions, fmt: int, s: series((d) => d.impressions) },
    { label: 'Eşleşme oranı', cur: t.fillRate, prev: p.fillRate, fmt: (v: number) => pct(v, 2), s: null },
    { label: 'eBGBM (eCPM)', cur: t.ecpm, prev: p.ecpm, fmt: money2, s: series((d) => d.ecpm) },
  ]

  const apps = games
    .map((g) => {
      const c = totals(cur.filter((r) => r.gameId === g.id))
      const pr = totals(prev.filter((r) => r.gameId === g.id))
      return { g, c, pr }
    })
    .filter((a) => a.c.impressions > 0 || a.pr.impressions > 0)
    .sort((a, b) => b.c.adRevenue - a.c.adRevenue)

  return (
    <>
      <section className="card" style={{ background: 'linear-gradient(150deg, #2a2a2a, #161616)' }}>
        <div className="card-title">Toplam tahmini kazanç</div>
        <div className="card-sub">AdMob · reklam geliri</div>
        <div className="grid g-4" style={{ marginTop: 14 }}>
          {tiles.map((x) => (
            <div key={x.label}>
              <div className="muted small">{x.label}</div>
              <div style={{ fontSize: 28, fontWeight: 300, marginTop: 4 }}>{money2(x.value)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid g-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">Reklam performansı</div>
          <div className="card-sub">Son 7 gün ile önceki 7 günün karşılaştırması · yeşil çizgi bu hafta, soluk çizgi geçen hafta</div>
          <div className="grid g-2" style={{ gap: 18, marginTop: 16 }}>
            {metrics.map((m) => (
              <div key={m.label} className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="muted small">{m.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 300, margin: '4px 0' }}>{m.fmt(m.cur)}</div>
                  <Diff cur={m.cur} prev={m.prev} fmt={m.fmt} />
                </div>
                {m.s && <Compare cur={m.s[0]} prev={m.s[1]} />}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Uygulama performansı</div>
          <div className="card-sub">Son 7 gün · önceki 7 güne göre</div>
          {apps.length === 0 ? (
            <div className="empty">Son 14 günde reklam gösterimi olan uygulama yok.</div>
          ) : (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>Uygulama</th><th className="num">Tahmini kazanç</th><th className="num">Gösterim</th></tr></thead>
                <tbody>
                  {apps.map(({ g, c, pr }) => (
                    <tr key={g.id}>
                      <td>
                        <span className="game-chip">
                          <GameLogo id={g.id} size={34} />
                          <span>
                            {g.name}
                            <span className="muted small" style={{ display: 'block' }}>{g.platforms.map((x) => (x === 'ios' ? 'iOS' : 'Android')).join(' · ')}</span>
                          </span>
                        </span>
                      </td>
                      <td className="num">
                        {money2(c.adRevenue)}
                        <div><Diff cur={c.adRevenue} prev={pr.adRevenue} fmt={money2} /></div>
                      </td>
                      <td className="num">
                        {int(c.impressions)}
                        <div><Diff cur={c.impressions} prev={pr.impressions} fmt={int} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
