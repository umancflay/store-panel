import { useMemo, useState } from 'react'
import { Cell, Line, LineChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Sparkles, TrendingDown, Wallet, Eye, BarChart3, Percent } from 'lucide-react'
import { admobAdvice, gameById, type AdUnit } from '../data/sample'
import { useData } from '../lib/data'
import { byDay, periodRows, totals } from '../lib/metrics'
import { change, dayLabel, int, money, money2, pct, short } from '../lib/format'
import { ChartTip, GameChip, SampleBanner, Seg, StatCard } from '../components/ui'
import Needs from '../components/Needs'

type View = 'game' | 'country' | 'format' | 'unit'
const formatColors = ['#0075ff', '#2cd9ff', '#01b574', '#9f7aea']

// eCPM %10'dan fazla düştüyse ya da fill rate %85'in altındaysa işaretle
const ecpmDropped = (cur: number, prev: number) => change(cur, prev) < -10
const fillBad = (v: number) => v < 85

export default function Revenue() {
  const [view, setView] = useState<View>('game')
  const [game, setGame] = useState('all')
  const { daily, games, adUnits, countries, demo, connected } = useData()

  const units = adUnits.filter((u) => game === 'all' || u.gameId === game)
  const { cur, prev } = useMemo(() => periodRows(daily, 30, (r) => game === 'all' || r.gameId === game), [daily, game])
  const t = totals(cur)
  const p = totals(prev)
  const chart = useMemo(() => byDay(cur), [cur])

  const byFormat = useMemo(() => {
    const m = new Map<string, { name: string; revenue: number; impressions: number; ecpm: number; ecpmPrev: number; fill: number; fillPrev: number; n: number }>()
    for (const u of units) {
      const k = u.format
      const e = m.get(k) ?? { name: k, revenue: 0, impressions: 0, ecpm: 0, ecpmPrev: 0, fill: 0, fillPrev: 0, n: 0 }
      e.revenue += u.revenue; e.impressions += u.impressions; e.ecpm += u.ecpm; e.ecpmPrev += u.ecpmPrev; e.fill += u.fillRate; e.fillPrev += u.fillPrev; e.n++
      m.set(k, e)
    }
    return [...m.values()].map((e) => ({ ...e, ecpm: e.ecpm / e.n, ecpmPrev: e.ecpmPrev / e.n, fill: e.fill / e.n, fillPrev: e.fillPrev / e.n }))
  }, [units])
  const maxCountry = Math.max(1, ...countries.map((c) => c.revenue))

  if (!demo && !connected.admob) return <Needs source="admob" />

  return (
    <>
      <SampleBanner />

      <div className="flex between wrap">
        <Seg<View> value={view} onChange={setView} options={[
          { value: 'game', label: 'Oyun' }, { value: 'country', label: 'Ülke' }, { value: 'format', label: 'Reklam formatı' }, { value: 'unit', label: 'Reklam birimi' },
        ]} />
        <select className="select" value={game} onChange={(e) => setGame(e.target.value)}>
          <option value="all">Tüm oyunlar</option>
          {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <section className="grid g-4">
        <StatCard label="Reklam geliri (30 gün)" value={t.adRevenue} format={money} delta={change(t.adRevenue, p.adRevenue)} icon={<Wallet size={20} />} />
        <StatCard label="Gösterim" value={t.impressions} format={short} delta={change(t.impressions, p.impressions)} icon={<Eye size={20} />} />
        <StatCard label="eCPM" value={t.ecpm} format={money2} delta={change(t.ecpm, p.ecpm)} icon={<BarChart3 size={20} />} />
        <StatCard label="Fill rate" value={t.fillRate} format={(v) => pct(v)} delta={change(t.fillRate, p.fillRate)} icon={<Percent size={20} />} color="#01b574" />
      </section>

      <section className="grid g-chart">
        <div className="card">
          <div className="card-title">eCPM trendi</div>
          <div className="card-sub" style={{ marginBottom: 14 }}>Son 30 gün, günlük ortalama</div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ left: -14, right: 4 }}>
                <defs>
                  <linearGradient id="ecpmLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#2cd9ff" /><stop offset="100%" stopColor="#0075ff" /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#a0aec0', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fill: '#a0aec0', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => '$' + v} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTip fmt={money2} />} />
                <Line type="monotone" dataKey="ecpm" name="eCPM" stroke="url(#ecpmLine)" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#0075ff', stroke: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Formata göre gelir</div>
          <div style={{ height: 200, marginTop: 8 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byFormat} dataKey="revenue" nameKey="name" innerRadius={58} outerRadius={85} paddingAngle={3} stroke="none">
                  {byFormat.map((_, i) => <Cell key={i} fill={formatColors[i % 4]} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="tip"><b>{payload[0].name}</b><div><span>Gelir</span><span>{money(payload[0].value as number)}</span></div></div> : null} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {byFormat.map((f, i) => (
              <div className="flex small" key={f.name}><span className="dot" style={{ background: formatColors[i % 4] }} /> <span className="muted" style={{ flex: 1 }}>{f.name}</span><b>{money(f.revenue)}</b></div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Detaylı gelir</div>
            <div className="card-sub flex"><TrendingDown size={14} color="var(--red)" /> Kırmızı: eCPM %10'dan fazla düşmüş ya da fill rate %85'in altında</div>
          </div>
        </div>
        <div className="table-wrap">
          {view === 'game' && (
            <table>
              <thead><tr><th>Oyun</th><th className="num">Gelir</th><th className="num">Gösterim</th><th className="num">eCPM</th><th className="num">Fill rate</th></tr></thead>
              <tbody>
                {games.filter((g) => game === 'all' || g.id === game).flatMap((g) => g.platforms.map((pl) => {
                  const c = totals(cur.filter((r) => r.gameId === g.id && r.platform === pl))
                  const pr = totals(prev.filter((r) => r.gameId === g.id && r.platform === pl))
                  return (
                    <tr key={g.id + pl}>
                      <td><GameChip id={g.id} platform={pl} /></td>
                      <td className="num">{money(c.adRevenue)}</td>
                      <td className="num">{int(c.impressions)}</td>
                      <td className={`num ${ecpmDropped(c.ecpm, pr.ecpm) ? 'bad-cell' : ''}`}>{money2(c.ecpm)}</td>
                      <td className={`num ${fillBad(c.fillRate) ? 'bad-cell' : ''}`}>{pct(c.fillRate)}</td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          )}
          {view === 'country' && (
            <table>
              <thead><tr><th>Ülke</th><th className="num">Gelir</th><th className="num">Gösterim</th><th className="num">eCPM</th><th className="num">Önceki eCPM</th><th style={{ width: 160 }}>Pay</th></tr></thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.code}>
                    <td><b>{c.code}</b> <span className="muted">{c.name}</span></td>
                    <td className="num">{money(c.revenue)}</td>
                    <td className="num">{int(c.impressions)}</td>
                    <td className={`num ${c.ecpmPrev && ecpmDropped(c.ecpm, c.ecpmPrev) ? 'bad-cell' : ''}`}>{money2(c.ecpm)}</td>
                    <td className="num muted">{money2(c.ecpmPrev)}</td>
                    <td><div className="bar"><i style={{ width: `${(c.revenue / maxCountry) * 100}%` }} /></div></td>
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

      {!demo && <Needs source="claude" title="Claude'un AdMob önerileri (mediation, yerleşim, sıklık) Claude bağlanınca gelecek" />}
      {demo && <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title flex"><Sparkles size={18} color="var(--primary)" /> Claude'un AdMob önerileri</div>
            <div className="card-sub">Mediation, reklam yerleşimi ve sıklık. Hiçbiri otomatik uygulanmaz.</div>
          </div>
        </div>
        <div className="grid g-3">
          {admobAdvice.map((a) => (
            <div className="inner" key={a.title}>
              <span className="badge b-primary">{a.tag}</span>
              <b style={{ display: 'block', margin: '10px 0 6px', lineHeight: 1.4 }}>{a.title}</b>
              <p className="muted small" style={{ lineHeight: 1.6 }}>{a.body}</p>
            </div>
          ))}
        </div>
      </section>}
    </>
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
            <td><span className="dot" style={{ background: gameById(u.gameId)?.color, marginRight: 8 }} />{u.name}</td>
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
