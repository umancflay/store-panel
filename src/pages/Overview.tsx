import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Wallet, Download, BarChart3, AlertTriangle, Sparkles, TrendingUp, Eye, Zap, Star, Bug, Smartphone } from 'lucide-react'
import { dailySummary, games, daily } from '../data/sample'
import { byDay, limits, periodRows, totals, type Range } from '../lib/metrics'
import { change, dayLabel, int, money, money2, pct, short, platformLabel } from '../lib/format'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { ChartTip, Gauge, GameChip, HeroOrb, RangePicker, SampleBanner, StatCard } from '../components/ui'

export default function Overview() {
  const [range, setRange] = useState<Range>(7)
  const { email } = useAuth()
  const { alerts } = useStore()
  const nav = useNavigate()

  const { cur, prev } = useMemo(() => periodRows(range), [range])
  const t = totals(cur)
  const p = totals(prev)
  const openIssues = alerts.filter((a) => a.status === 'open').length
  // Grafik en az 14 gün göstersin; "Dün" seçiliyken tek nokta anlamsız olur
  const chartData = useMemo(() => byDay(periodRows((range < 14 ? 14 : range) as Range).cur), [range])

  const gameRows = useMemo(
    () =>
      games.flatMap((g) =>
        g.platforms.map((pl) => {
          const rows = cur.filter((r) => r.gameId === g.id && r.platform === pl)
          return { game: g, platform: pl, ...totals(rows) }
        }),
      ),
    [cur],
  )

  const name = (email ?? '').split('@')[0]
  const avgRating = t.rating
  const healthy = gameRows.filter((r) => r.crashRate < limits.crash && (r.platform === 'ios' || r.anrRate < limits.anr)).length
  const health = (healthy / gameRows.length) * 10

  return (
    <>
      <div className="flex between wrap">
        <SampleBanner />
        <RangePicker value={range} onChange={setRange} />
      </div>

      <section className="grid g-4">
        <StatCard label="Toplam gelir" value={t.revenue} format={money} delta={change(t.revenue, p.revenue)} icon={<Wallet size={20} />} />
        <StatCard label="İndirme" value={t.downloads} format={int} delta={change(t.downloads, p.downloads)} icon={<Download size={20} />} />
        <StatCard label="Ortalama eCPM" value={t.ecpm} format={money2} delta={change(t.ecpm, p.ecpm)} icon={<BarChart3 size={20} />} />
        <StatCard label="Açık sorun" value={openIssues} format={int} icon={<AlertTriangle size={20} />} color="#ff4d5e" />
      </section>

      <section className="grid g-hero">
        <div className="card hero">
          <HeroOrb />
          <div className="hero-content">
            <span className="muted small">Tekrar hoş geldin,</span>
            <h2 style={{ textTransform: 'capitalize' }}>{name || 'Geliştirici'}</h2>
            <span className="ai-tag" style={{ alignSelf: 'flex-start' }}><Sparkles size={12} /> Günün özeti · Claude</span>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '12px 0 4px', lineHeight: 1.45 }}>{dailySummary.headline}</p>
            <ul className="summary-list">
              {dailySummary.changes.slice(0, 2).map((c) => (
                <li key={c}><TrendingUp size={15} color="var(--cyan)" />{c}</li>
              ))}
              {dailySummary.attention.slice(0, 1).map((c) => (
                <li key={c}><Eye size={15} color="var(--orange)" />{c}</li>
              ))}
              {dailySummary.actions.slice(0, 1).map((c) => (
                <li key={c}><Zap size={15} color="var(--green)" />{c}</li>
              ))}
            </ul>
            <button className="btn" style={{ alignSelf: 'flex-start', marginTop: 'auto', paddingTop: 9 }} onClick={() => nav('/uyarilar')}>
              Uyarılara git →
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Ortalama puan</div>
          <div className="card-sub">Tüm oyunlar, iki mağaza</div>
          <Gauge id="rating" value={avgRating} max={5} size={180} color="#0075ff" color2="#2cd9ff">
            <Star size={26} color="#ffc24b" fill="#ffc24b" />
          </Gauge>
          <div className="gauge-foot">
            <span>0</span>
            <div style={{ textAlign: 'center' }}>
              <b>{avgRating.toFixed(2).replace('.', ',')}</b>
              <span style={{ display: 'block' }}>5 üzerinden</span>
            </div>
            <span>5</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Uygulama sağlığı</div>
          </div>
          <div className="flex" style={{ alignItems: 'stretch', gap: 16 }}>
            <div style={{ display: 'grid', gap: 12, flex: 1 }}>
              <div className="inner">
                <div className="muted small">Çökme oranı</div>
                <div style={{ fontWeight: 800, fontSize: 18 }} className={t.crashRate > limits.crash ? 'bad' : ''}>{pct(t.crashRate, 2)}</div>
              </div>
              <div className="inner">
                <div className="muted small">ANR oranı</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{pct(t.anrRate, 2)}</div>
              </div>
            </div>
            <Gauge id="health" value={health} max={10} size={150} arc={0.8} color="#01b574" color2="#2cd9ff">
              <small>Sağlık</small>
              <div className="big">{health.toFixed(1).replace('.', ',')}</div>
              <small>{healthy}/{gameRows.length} sürüm iyi</small>
            </Gauge>
          </div>
        </div>
      </section>

      <section className="grid g-chart">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Günlük gelir</div>
              <div className="card-sub"><span className="up" style={{ fontWeight: 700 }}>{money(t.revenue)}</span> seçili dönemde</div>
            </div>
            <div className="flex small muted">
              <span className="dot" style={{ background: '#0075ff' }} /> Reklam
              <span className="dot" style={{ background: '#2cd9ff', marginLeft: 8 }} /> Uygulama içi
            </div>
          </div>
          <div style={{ height: 290 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ left: -10, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="gAd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0075ff" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="#0075ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gIap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2cd9ff" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#2cd9ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#a0aec0', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: '#a0aec0', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => '$' + short(v)} />
                <Tooltip content={<ChartTip fmt={money2} />} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} />
                <Area type="monotone" dataKey="ad" name="Reklam" stroke="#0075ff" strokeWidth={2.5} fill="url(#gAd)" animationDuration={900} />
                <Area type="monotone" dataKey="iap" name="Uygulama içi" stroke="#2cd9ff" strokeWidth={2.5} fill="url(#gIap)" animationDuration={1100} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="inner" style={{ background: 'linear-gradient(127deg, #060b28 19%, rgba(10,14,35,0.6) 77%)', padding: '20px 8px 8px' }}>
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={chartData.slice(-10)} margin={{ left: -18, right: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis tick={{ fill: '#fff', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={short} />
                  <Tooltip content={<ChartTip fmt={int} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="downloads" name="İndirme" fill="#fff" radius={[8, 8, 8, 8]} barSize={7} animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card-title" style={{ marginTop: 18 }}>İndirmeler</div>
          <div className="card-sub">
            <Delta2 v={change(t.downloads, p.downloads)} /> önceki döneme göre
          </div>
          <div className="mini-stats">
            {[
              { lbl: 'İndirme', val: short(t.downloads), icon: Download, w: 80 },
              { lbl: 'Gösterim', val: short(t.impressions), icon: Eye, w: 65 },
              { lbl: 'Reklam', val: money(t.adRevenue), icon: Wallet, w: 72 },
              { lbl: 'IAP', val: money(t.iapRevenue), icon: Smartphone, w: 30 },
            ].map((m) => (
              <div className="mini-stat" key={m.lbl}>
                <div className="lbl"><span className="icon-box sm"><m.icon size={13} /></span>{m.lbl}</div>
                <div className="val">{m.val}</div>
                <div className="bar"><i style={{ width: `${m.w}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Oyunlar</div>
            <div className="card-sub">Kırmızı değerler dikkat gerektirir. Detay için satıra tıkla.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Oyun</th>
                <th className="num">İndirme</th>
                <th className="num">Gelir</th>
                <th className="num">Puan</th>
                <th className="num">Çökme</th>
                <th className="num">ANR</th>
                <th style={{ width: 140 }}>Gelir payı</th>
              </tr>
            </thead>
            <tbody>
              {gameRows.map((r) => (
                <tr key={r.game.id + r.platform} className="clickable" onClick={() => nav('/oyunlar/' + r.game.id)}>
                  <td><GameChip id={r.game.id} platform={r.platform} /></td>
                  <td className="num">{int(r.downloads)}</td>
                  <td className="num">{money(r.revenue)}</td>
                  <td className={`num ${r.rating < limits.rating ? 'bad-cell' : ''}`}>★ {r.rating.toFixed(1).replace('.', ',')}</td>
                  <td className={`num ${r.crashRate > limits.crash ? 'bad-cell' : ''}`}>{pct(r.crashRate, 2)}</td>
                  <td className={`num ${r.platform === 'android' && r.anrRate > limits.anr ? 'bad-cell' : ''}`}>{r.platform === 'ios' ? '–' : pct(r.anrRate, 2)}</td>
                  <td>
                    <div className="small muted" style={{ marginBottom: 6 }}>{pct((r.revenue / t.revenue) * 100, 0)} · {platformLabel(r.platform)}</div>
                    <div className="bar"><i style={{ width: `${(r.revenue / t.revenue) * 100}%`, background: r.game.color }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {daily.length === 0 && <div className="empty"><Bug /> Veri yok</div>}
      </section>
    </>
  )
}

function Delta2({ v }: { v: number }) {
  return <span className={v >= 0 ? 'up' : 'down'} style={{ fontWeight: 700 }}>({v >= 0 ? '+' : ''}{v.toFixed(0)}%)</span>
}
