import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingDown } from 'lucide-react'
import { gameById, type AdUnit } from '../data/sample'
import { useData } from '../lib/data'
import { byDay, limits, periodRows, totals } from '../lib/metrics'
import { change, currencySymbol, dayLabel, int, localIso, money, money2, pct, short } from '../lib/format'
import { ChartTip, Delta, Donut, GameChip, GameLogo, Rings, SampleBanner, Seg, Sparkline, StatCard, useCountUp } from '../components/ui'
import Needs from '../components/Needs'
import AdmobSummary from '../components/AdmobSummary'
import Select from '../components/Select'

type View = 'game' | 'country' | 'format' | 'unit'
const formatColors = ['#FFFFFF', '#8FD3AE', '#E8C07A', '#8A8A8A', '#D9D9D9']
const DOW = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

// eCPM %10'dan fazla düştüyse ya da fill rate %85'in altındaysa işaretle
const ecpmDropped = (cur: number, prev: number) => prev > 0 && change(cur, prev) < -10
const fillBad = (v: number) => v < 85

export default function Revenue() {
  const [range, setRange] = useState<'7' | '30'>('30')
  const [view, setView] = useState<View>('game')
  const [game, setGame] = useState('all')
  const { daily, games, adUnits, countries, reviews, demo, connected, hasStore } = useData()
  const r = Number(range)

  const filter = (x: { gameId: string }) => game === 'all' || x.gameId === game
  const { cur, prev } = useMemo(() => periodRows(daily, r, filter), [daily, r, game]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = totals(cur)
  const p = totals(prev)
  const chart = useMemo(() => byDay(cur), [cur])
  const total = useCountUp(t.revenue)
  const units = adUnits.filter(filter)
  const month = periodRows(daily, 30)

  // Haftanın günü × hafta ısı haritası (son 8 hafta, günlük toplam gelir)
  const heat = useMemo(() => {
    const days = byDay(periodRows(daily, 56, filter).cur)
    const map = new Map(days.map((d) => [d.date, d.ad + d.iap]))
    const end = new Date()
    end.setDate(end.getDate() - 1)
    const monday = new Date(end)
    monday.setDate(end.getDate() - ((end.getDay() + 6) % 7) - 7 * 7)
    const weeks: { label: string; cells: { date: string; v: number | null }[] }[] = []
    for (let w = 0; w < 8; w++) {
      const cells = []
      for (let d = 0; d < 7; d++) {
        const x = new Date(monday)
        x.setDate(monday.getDate() + w * 7 + d)
        const iso = localIso(x)
        cells.push({ date: iso, v: x > end ? null : map.get(iso) ?? 0 })
      }
      weeks.push({ label: dayLabel(cells[0].date), cells })
    }
    return { weeks, max: Math.max(0.01, ...days.map((d) => d.ad + d.iap)) }
  }, [daily, game]) // eslint-disable-line react-hooks/exhaustive-deps

  const byFormat = useMemo(() => {
    const m = new Map<string, { name: string; revenue: number; impressions: number; ecpm: number; ecpmPrev: number; fill: number; n: number }>()
    for (const u of units) {
      const e = m.get(u.format) ?? { name: u.format, revenue: 0, impressions: 0, ecpm: 0, ecpmPrev: 0, fill: 0, n: 0 }
      e.revenue += u.revenue; e.impressions += u.impressions; e.ecpm += u.ecpm; e.ecpmPrev += u.ecpmPrev; e.fill += u.fillRate; e.n++
      m.set(u.format, e)
    }
    return [...m.values()].map((e) => ({ ...e, ecpm: e.ecpm / e.n, ecpmPrev: e.ecpmPrev / e.n, fill: e.fill / e.n })).sort((a, b) => b.revenue - a.revenue)
  }, [units])
  const topCountries = [...countries].sort((a, b) => b.revenue - a.revenue).slice(0, 6)
  const maxCountry = Math.max(1, ...topCountries.map((c) => c.revenue))

  // Oyuncu nabzı: son 30 günün yorum puanları
  const recent = reviews.filter((x) => filter(x) && Date.now() - new Date(x.date).getTime() < 30 * 86400000)
  const pos = recent.filter((x) => x.rating >= 4).length
  const neg = recent.filter((x) => x.rating <= 2).length
  const neu = recent.length - pos - neg

  if (!demo && !connected.admob) return <Needs source="admob" />

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Gelir · son {r} gün</span>
          <h1 style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 200, letterSpacing: -2 }}>{money(total)}</h1>
          <p className="flex" style={{ gap: 10 }}>
            <Delta value={change(t.revenue, p.revenue)} /> önceki {r} güne göre
          </p>
        </div>
        <div className="flex wrap" style={{ gap: 8 }}>
          <Select className="select" style={{ width: 'auto' }} value={game} onChange={(e) => setGame(e.target.value)} aria-label="Oyun">
            <option value="all">Tüm oyunlar</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Seg value={range} onChange={setRange} options={[{ value: '7', label: '7 gün' }, { value: '30', label: '30 gün' }]} />
        </div>
      </div>

      {connected.admob || demo ? <AdmobSummary /> : null}

      <div className="card">
        <div className="flex wrap" style={{ gap: 18, fontSize: 11, marginBottom: 10 }}>
          <span className="flex muted" style={{ gap: 6 }}><span className="dot" style={{ background: '#fff' }} /> AdMob reklam</span>
          <span className="flex muted" style={{ gap: 6 }}><span className="dot" style={{ background: '#8FD3AE' }} /> Uygulama içi satın alma {hasStore ? '' : '(mağaza bağlanınca)'}</span>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <AreaChart data={chart} margin={{ left: -14, right: 4, top: 6 }}>
              <defs>
                <linearGradient id="gAd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity={0.35} /><stop offset="100%" stopColor="#fff" stopOpacity={0} /></linearGradient>
                <linearGradient id="gIap" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8FD3AE" stopOpacity={0.35} /><stop offset="100%" stopColor="#8FD3AE" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => currencySymbol() + short(v)} />
              <Tooltip content={<ChartTip fmt={money2} />} />
              <Area type="monotone" dataKey="ad" name="AdMob" stroke="#fff" strokeWidth={1.8} fill="url(#gAd)" stackId="1" />
              <Area type="monotone" dataKey="iap" name="Satın alma" stroke="#8FD3AE" strokeWidth={1.8} fill="url(#gIap)" stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section className="grid g-4">
        <StatCard label="Reklam geliri" value={t.adRevenue} format={money} delta={change(t.adRevenue, p.adRevenue)} spark={chart.map((d) => d.ad)} />
        <StatCard label="Gösterim" value={t.impressions} format={short} delta={change(t.impressions, p.impressions)} spark={chart.map((d) => d.impressions)} />
        <StatCard label="eCPM" value={t.ecpm} format={money2} delta={change(t.ecpm, p.ecpm)} spark={chart.map((d) => d.ecpm)} />
        <StatCard label="Fill rate" value={t.requests ? t.fillRate : null} format={(v) => pct(v)} delta={change(t.fillRate, p.fillRate)} />
      </section>

      <section className="grid g-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Oyun sağlığı</div>
              <div className="card-sub">Dış halka: aylık hedef · orta: puan · iç: çökmesiz oturum</div>
            </div>
            <Link to="/ayarlar" className="linkish">Hedefleri ayarla</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {games.length === 0 && <div className="empty">Oyun yok.</div>}
            {games.map((g) => {
              const m = totals(month.cur.filter((x) => x.gameId === g.id))
              const goal = g.goal ?? null
              return (
                <div key={g.id} className="flex" style={{ gap: 16 }}>
                  <Rings size={96} rings={[
                    { value: goal ? m.revenue / goal : 0, color: '#FFFFFF' },
                    { value: m.rating != null ? m.rating / 5 : 0, color: '#E8C07A' },
                    { value: m.crashRate != null ? Math.max(0, 1 - m.crashRate / (limits.crash * 2)) : 0, color: '#8FD3AE' },
                  ]} />
                  <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 4, fontSize: 12 }}>
                    <b style={{ fontWeight: 500 }}>{g.name}</b>
                    <span className="muted">Gelir {money(m.revenue)}{goal ? ` / hedef ${money(goal)} (%${Math.round((m.revenue / goal) * 100)})` : ' · hedef yok'}</span>
                    <span className="muted">Puan {m.rating != null ? m.rating.toFixed(1).replace('.', ',') : '—'} · Çökme {m.crashRate != null ? pct(m.crashRate, 2) : '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Haftalık ritim</div>
          <div className="card-sub">Son 8 hafta · günlük gelir (koyu = düşük, parlak = yüksek)</div>
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(7, minmax(26px, 1fr))`, gap: 4, minWidth: 300, fontSize: 10 }}>
              <span />
              {DOW.map((d) => <span key={d} className="muted" style={{ textAlign: 'center' }}>{d}</span>)}
              {heat.weeks.map((w) => (
                <div key={w.label} style={{ display: 'contents' }}>
                  <span className="muted" style={{ alignSelf: 'center' }}>{w.label}</span>
                  {w.cells.map((c) => (
                    <span
                      key={c.date}
                      title={c.v == null ? '' : `${dayLabel(c.date)}: ${money2(c.v)}`}
                      style={{
                        height: 22, borderRadius: 6,
                        background: c.v == null ? 'transparent' : `rgba(143, 211, 174, ${0.06 + 0.9 * (c.v / heat.max)})`,
                        border: c.v == null ? '1px dashed rgba(255,255,255,.06)' : undefined,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid g-3">
        <div className="card">
          <div className="card-title">Ülkeler</div>
          <div className="card-sub">Son 30 gün · AdMob</div>
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {topCountries.length === 0 && <div className="muted small">Veri yok.</div>}
            {topCountries.map((c) => (
              <div key={c.code} style={{ display: 'grid', gap: 6 }}>
                <div className="flex between small"><span>{c.name}</span><b style={{ fontWeight: 500 }}>{money(c.revenue)}</b></div>
                <div className="bar"><i style={{ width: `${(c.revenue / maxCountry) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Reklam formatları</div>
          <div className="card-sub">Gelir payı · 30 gün</div>
          <div className="flex" style={{ gap: 16, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Donut size={130} parts={byFormat.map((f, i) => ({ value: f.revenue, color: formatColors[i % formatColors.length] }))}>
              <b style={{ fontSize: 15, fontWeight: 400 }}>{byFormat.length}</b>
              <small className="muted" style={{ fontSize: 10 }}>format</small>
            </Donut>
            <div className="legend" style={{ flex: 1, minWidth: 140 }}>
              {byFormat.map((f, i) => (
                <div key={f.name} className="legend-row"><span className="dot" style={{ background: formatColors[i % formatColors.length] }} /><span>{f.name}</span><b>{money(f.revenue)}</b></div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Oyuncu nabzı</div>
          <div className="card-sub">Son 30 günün yorumları</div>
          {!hasStore && !demo ? (
            <div className="muted small" style={{ marginTop: 14 }}>Mağaza bağlanınca yorumlar burada özetlenir.</div>
          ) : recent.length === 0 ? (
            <div className="muted small" style={{ marginTop: 14 }}>Son 30 günde yorum yok.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
                <i style={{ flex: pos, background: '#8FD3AE' }} />
                <i style={{ flex: neu, background: '#8A8A8A' }} />
                <i style={{ flex: neg, background: '#FF7A55' }} />
              </div>
              <div className="legend">
                <div className="legend-row"><span className="dot" style={{ background: '#8FD3AE' }} /><span>Memnun (4–5★)</span><b>{pos}</b></div>
                <div className="legend-row"><span className="dot" style={{ background: '#8A8A8A' }} /><span>Kararsız (3★)</span><b>{neu}</b></div>
                <div className="legend-row"><span className="dot" style={{ background: '#FF7A55' }} /><span>Mutsuz (1–2★)</span><b>{neg}</b></div>
              </div>
              <Link to="/yorumlar" className="linkish">Yorumlara git →</Link>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Oyunlar</div>
            <div className="card-sub">Son {r} gün</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Oyun</th><th>Trend</th><th className="num">Gelir</th><th className="num">Değişim</th><th className="num">İndirme</th><th className="num">eCPM</th></tr></thead>
            <tbody>
              {games.map((g) => {
                const rows = cur.filter((x) => x.gameId === g.id)
                const c = totals(rows)
                const pr = totals(prev.filter((x) => x.gameId === g.id))
                return (
                  <tr key={g.id}>
                    <td><Link to={`/oyunlar/${g.id}`} className="game-chip"><GameLogo id={g.id} /> {g.name}</Link></td>
                    <td><Sparkline values={byDay(rows).map((d) => d.ad + d.iap)} width={110} height={30} dots={false} /></td>
                    <td className="num">{money(c.revenue)}</td>
                    <td className="num"><Delta value={change(c.revenue, pr.revenue)} /></td>
                    <td className="num">{hasStore ? int(c.downloads) : '—'}</td>
                    <td className="num">{money2(c.ecpm)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">AdMob ayrıntısı</div>
            <div className="card-sub flex" style={{ gap: 6 }}><TrendingDown size={13} color="var(--orange)" /> Turuncu: eCPM %10’dan fazla düşmüş ya da fill rate %85’in altında</div>
          </div>
          <Seg<View> value={view} onChange={setView} options={[
            { value: 'game', label: 'Oyun' }, { value: 'country', label: 'Ülke' }, { value: 'format', label: 'Format' }, { value: 'unit', label: 'Birim' },
          ]} />
        </div>
        <div className="table-wrap">
          {view === 'game' && (
            <table>
              <thead><tr><th>Oyun</th><th className="num">Gelir</th><th className="num">Gösterim</th><th className="num">eCPM</th><th className="num">Fill rate</th></tr></thead>
              <tbody>
                {games.filter((g) => game === 'all' || g.id === game).flatMap((g) => g.platforms.map((pl) => {
                  const c = totals(cur.filter((x) => x.gameId === g.id && x.platform === pl))
                  const pr = totals(prev.filter((x) => x.gameId === g.id && x.platform === pl))
                  return (
                    <tr key={g.id + pl}>
                      <td><GameChip id={g.id} platform={pl} /></td>
                      <td className="num">{money(c.adRevenue)}</td>
                      <td className="num">{int(c.impressions)}</td>
                      <td className={`num ${ecpmDropped(c.ecpm, pr.ecpm) ? 'bad-cell' : ''}`}>{money2(c.ecpm)}</td>
                      <td className={`num ${c.requests && fillBad(c.fillRate) ? 'bad-cell' : ''}`}>{c.requests ? pct(c.fillRate) : '—'}</td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          )}
          {view === 'country' && (
            <table>
              <thead><tr><th>Ülke</th><th className="num">Gelir</th><th className="num">Gösterim</th><th className="num">eCPM</th><th className="num">Önceki eCPM</th></tr></thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.code}>
                    <td><b>{c.code}</b> <span className="muted">{c.name}</span></td>
                    <td className="num">{money(c.revenue)}</td>
                    <td className="num">{int(c.impressions)}</td>
                    <td className={`num ${ecpmDropped(c.ecpm, c.ecpmPrev) ? 'bad-cell' : ''}`}>{money2(c.ecpm)}</td>
                    <td className="num muted">{money2(c.ecpmPrev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view === 'format' && (
            <table>
              <thead><tr><th>Format</th><th className="num">Gelir</th><th className="num">Gösterim</th><th className="num">eCPM</th><th className="num">Fill rate</th></tr></thead>
              <tbody>
                {byFormat.map((f) => (
                  <tr key={f.name}>
                    <td>{f.name}</td>
                    <td className="num">{money(f.revenue)}</td>
                    <td className="num">{int(f.impressions)}</td>
                    <td className={`num ${ecpmDropped(f.ecpm, f.ecpmPrev) ? 'bad-cell' : ''}`}>{money2(f.ecpm)}</td>
                    <td className={`num ${fillBad(f.fill) ? 'bad-cell' : ''}`}>{pct(f.fill)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view === 'unit' && <UnitTable units={units} />}
        </div>
      </section>
    </div>
  )
}

function UnitTable({ units }: { units: AdUnit[] }) {
  const sorted = [...units].sort((a, b) => b.revenue - a.revenue)
  return (
    <table>
      <thead><tr><th>Reklam birimi</th><th>Format</th><th className="num">Gelir</th><th className="num">Gösterim</th><th className="num">eCPM</th><th className="num">Fill rate</th></tr></thead>
      <tbody>
        {sorted.map((u) => (
          <tr key={u.id}>
            <td><span className="muted" style={{ marginRight: 8 }}>{gameById(u.gameId)?.name}</span>{u.name}</td>
            <td className="muted">{u.format}</td>
            <td className="num">{money(u.revenue)}</td>
            <td className="num">{int(u.impressions)}</td>
            <td className={`num ${ecpmDropped(u.ecpm, u.ecpmPrev) ? 'bad-cell' : ''}`} title={`Önceki: ${money2(u.ecpmPrev)}`}>{money2(u.ecpm)}</td>
            <td className={`num ${fillBad(u.fillRate) ? 'bad-cell' : ''}`} title={`Önceki: ${pct(u.fillPrev)}`}>{pct(u.fillRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
