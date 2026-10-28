import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Download, Wallet, Star, Bug, Package, EyeOff } from 'lucide-react'
import { gameById, type Platform } from '../data/sample'
import Needs from '../components/Needs'
import Players from '../components/Players'
import { useData } from '../lib/data'
import { useStore } from '../lib/store'
import { byDay, limits, periodRows, totals, type Range } from '../lib/metrics'
import { change, currencySymbol, dayLabel, int, money, money2, orDash, pct, platformLabel, short } from '../lib/format'
import { ChartTip, GameLogo, RangePicker, SampleBanner, Seg, StatCard, Stars } from '../components/ui'

export function GamesList() {
  const { daily, games, allGames, demo, hasStore, loading, setGameHidden } = useData()
  const { toast } = useStore()
  const { cur, prev } = useMemo(() => periodRows(daily, 30), [daily])
  const showStore = demo || hasStore
  const hiddenCount = allGames.length - games.length
  const hide = (id: string, name: string) =>
    setGameHidden(id, true)
      .then(() => toast(`${name} gizlendi. Ayarlar › Oyun listesi'nden geri açabilirsin.`, 'info'))
      .catch((e) => toast('Gizlenemedi: ' + e.message, 'warn'))
  return (
    <>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 12 }}>
        <div>
          <span className="eyebrow">Oyunlar</span>
          <h1>Mağazadaki oyunların</h1>
          <p>Boş ya da takip etmediğin oyunu kartın sağ üstündeki göz simgesiyle gizleyebilirsin.</p>
        </div>
        {hiddenCount > 0 && <Link to="/ayarlar" className="btn btn-ghost sm"><EyeOff size={13} /> {hiddenCount} gizli oyun</Link>}
      </div>
      {!loading && games.length === 0 && <div className="card empty">Henüz oyun yok. AdMob, Google Play ya da App Store bağlanınca oyunların burada kendiliğinden görünür.</div>}
      <div className="grid g-3">
        {games.map((g) => {
          const t = totals(cur.filter((r) => r.gameId === g.id))
          const p = totals(prev.filter((r) => r.gameId === g.id))
          const spark = byDay(cur.filter((r) => r.gameId === g.id))
          const d = change(t.revenue, p.revenue)
          return (
            <Link to={'/oyunlar/' + g.id} key={g.id} className="card fade-in" style={{ display: 'block', transition: 'transform .2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = '')}>
              <div className="flex">
                <GameLogo id={g.id} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">{g.name}</div>
                  <div className="muted small">{g.genre}</div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title="Panelde gizle"
                  aria-label={`${g.name} oyununu gizle`}
                  onClick={(e) => {
                    e.preventDefault()
                    hide(g.id, g.name)
                  }}
                >
                  <EyeOff size={14} />
                </button>
              </div>
              <div className="flex wrap" style={{ marginTop: 12, gap: 6 }}>
                {g.platforms.map((p) => <span key={p} className="chip">{platformLabel(p)}</span>)}
              </div>
              <div style={{ height: 70, margin: '14px -6px 6px' }}>
                <ResponsiveContainer>
                  <AreaChart data={spark}>
                    <defs>
                      <linearGradient id={'sp' + g.id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={g.color} stopOpacity={0.6} />
                        <stop offset="100%" stopColor={g.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="ad" stroke={g.color} strokeWidth={2} fill={`url(#sp${g.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid g-3" style={{ gap: 10 }}>
                <div><div className="muted small">30 gün gelir</div><b>{money(t.revenue)}</b> <span className={d >= 0 ? 'up small' : 'down small'}>{d >= 0 ? '+' : ''}{d.toFixed(0)}%</span></div>
                <div><div className="muted small">Toplam indirme</div><b title={g.installsLabel ?? ''}>{g.installs != null ? short(g.installs) : showStore && t.downloads ? short(t.downloads) : '—'}</b></div>
                <div><div className="muted small">Çökme</div><b className={t.crashRate != null && t.crashRate > limits.crash ? 'bad' : ''}>{orDash(t.crashRate, (v) => pct(v, 2))}</b></div>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}

export function GameDetail() {
  const { id = '' } = useParams()
  const game = gameById(id)
  const [range, setRange] = useState<Range>(30)
  const [platform, setPlatform] = useState<'all' | Platform>('all')
  const { daily, demo, connected, hasStore, reviews, builds } = useData()

  const filter = useMemo(() => (r: { gameId: string; platform: Platform }) => r.gameId === id && (platform === 'all' || r.platform === platform), [id, platform])
  const { cur, prev } = useMemo(() => periodRows(daily, range, filter), [daily, range, filter])
  const chart = useMemo(() => byDay(periodRows(daily, 30, filter).cur), [daily, filter])

  if (!game) return <div className="card empty">Oyun bulunamadı. <Link to="/oyunlar" className="up">Oyunlara dön</Link></div>

  const t = totals(cur)
  const p = totals(prev)
  const platformRows = game.platforms.map((pl) => ({ pl, ...totals(cur.filter((r) => r.platform === pl)) }))
  const gameReviews = reviews.filter((r) => r.gameId === id && (platform === 'all' || r.platform === platform)).slice(0, 5)
  const gameBuilds = builds.filter((b) => b.gameId === id)
  const showStore = demo || hasStore
  const na = (v: string) => (showStore ? v : '—')
  const p2 = (v: number) => pct(v, 2)
  const hasVitals = chart.some((d) => d.crash != null || d.anr != null)

  return (
    <>
      <SampleBanner />
      <div className="flex between wrap">
        <div className="flex">
          <Link to="/oyunlar" className="btn" aria-label="Geri"><ArrowLeft size={14} /></Link>
          <GameLogo id={game.id} size={64} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 400 }}>{game.name}</div>
            <div className="muted small">{game.genre}</div>
          </div>
        </div>
        <div className="flex wrap">
          {game.platforms.length > 1 && (
            <Seg value={platform} onChange={setPlatform} options={[{ value: 'all', label: 'Tümü' }, { value: 'android', label: 'Android' }, { value: 'ios', label: 'iOS' }]} />
          )}
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <section className="grid g-4">
        <StatCard label="Gelir" value={t.revenue} format={money} delta={change(t.revenue, p.revenue)} icon={<Wallet size={20} />} />
        <StatCard
          label="Toplam indirme"
          value={game.installs ?? (showStore && t.downloads ? t.downloads : null)}
          format={int}
          note={t.downloads > 0 ? `+${int(t.downloads)} bu dönem` : game.installsLabel ? `Play: ${game.installsLabel}` : undefined}
          icon={<Download size={20} />}
        />
        <StatCard label="Puan" value={t.rating} format={(v) => v.toFixed(2).replace('.', ',')} icon={<Star size={20} />} color="#E8C07A" />
        <StatCard label="Çökme oranı" value={t.crashRate} format={p2} delta={p.crashRate != null && t.crashRate != null ? change(t.crashRate, p.crashRate) : undefined} invertDelta icon={<Bug size={20} />} color="#FF7A55" />
      </section>

      <section className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Platform bazında</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Platform</th><th className="num">İndirme</th><th className="num">Reklam</th><th className="num">IAP</th><th className="num">eCPM</th><th className="num">Fill rate</th><th className="num">Puan</th><th className="num">Çökme</th><th className="num">ANR</th></tr></thead>
            <tbody>
              {platformRows.map((r) => (
                <tr key={r.pl}>
                  <td>{platformLabel(r.pl)}</td>
                  <td className="num">{na(int(r.downloads))}</td>
                  <td className="num">{money(r.adRevenue)}</td>
                  <td className="num">{na(money(r.iapRevenue))}</td>
                  <td className="num">{r.impressions ? money2(r.ecpm) : '—'}</td>
                  <td className={`num ${r.requests && r.fillRate < 85 ? 'bad-cell' : ''}`}>{r.requests ? pct(r.fillRate) : '—'}</td>
                  <td className={`num ${r.rating != null && r.rating < limits.rating ? 'bad-cell' : ''}`}>{orDash(r.rating, (v) => v.toFixed(2).replace('.', ','))}</td>
                  <td className={`num ${r.crashRate != null && r.crashRate > limits.crash ? 'bad-cell' : ''}`}>{orDash(r.crashRate, p2)}</td>
                  <td className="num">{r.pl === 'ios' ? '–' : orDash(r.anrRate, p2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid g-2">
        <div className="card">
          <div className="card-title">Gelir (30 gün)</div>
          <div className="card-sub" style={{ marginBottom: 14 }}>Reklam ve uygulama içi satın alma</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ left: -14, right: 4 }}>
                <defs>
                  <linearGradient id="gd1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={game.color} stopOpacity={0.6} /><stop offset="100%" stopColor={game.color} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => currencySymbol() + short(v)} />
                <Tooltip content={<ChartTip fmt={money2} />} />
                <Area type="monotone" dataKey="ad" name="Reklam" stroke={game.color} strokeWidth={2.5} fill="url(#gd1)" />
                {showStore && <Area type="monotone" dataKey="iap" name="Uygulama içi" stroke="#8FD3AE" strokeWidth={2} fill="transparent" />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Çökme ve ANR trendi</div>
          <div className="card-sub" style={{ marginBottom: 14 }}>Kesikli çizgi: Google'ın "kötü davranış" eşiği (%{String(limits.crash).replace('.', ',')})</div>
          {!hasVitals ? (
            <div className="empty">{connected.google_play || demo ? 'Henüz çökme verisi yok. Google bu veriyi 1-2 gün geriden verir.' : 'Google Play bağlanınca burada görünecek.'}</div>
          ) : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ left: -14, right: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => '%' + v} />
                <Tooltip content={<ChartTip fmt={(v) => pct(v, 2)} />} />
                <ReferenceLine y={limits.crash} stroke="#FF7A55" strokeDasharray="6 4" />
                <Line type="monotone" dataKey="crash" name="Çökme" stroke="#FF7A55" strokeWidth={2.5} dot={false} />
                {game.platforms.includes('android') && platform !== 'ios' && <Line type="monotone" dataKey="anr" name="ANR" stroke="#E8C07A" strokeWidth={2} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
      </section>

      {game.platforms.includes('android') && platform !== 'ios' && (demo || connected.google_play) && <Players gameId={game.id} />}

      <section className="grid g-2">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Son yorumlar</div>
            <Link to="/yorumlar" className="btn">Tümü</Link>
          </div>
          {gameReviews.map((r) => (
            <div className="review" key={r.id}>
              <div className="review-head"><Stars n={r.rating} /><b className="small">{r.author}</b><span className="badge b-muted">{platformLabel(r.platform)}</span><span className="muted small">{dayLabel(r.date)}</span></div>
              <p className="small" style={{ lineHeight: 1.55, color: '#d0d0d0' }}>{r.body}</p>
            </div>
          ))}
          {gameReviews.length === 0 && <div className="empty">{hasStore || demo ? 'Henüz yorum yok.' : 'Mağazalar bağlanınca yorumlar burada görünecek.'}</div>}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Son build ve inceleme durumu</div>
          {gameBuilds.map((b) => (
            <div className="row" key={b.platform}>
              <span className="icon-box sm" style={{ width: 36, height: 36 }}><Package size={16} /></span>
              <div className="grow">
                <b>{platformLabel(b.platform)} · v{b.version}</b> <span className="muted small">(build {b.build})</span>
                <div className="muted small">{dayLabel(b.date)}</div>
              </div>
              <span className={`badge ${/Reddedildi|Geçersiz|Durduruldu/.test(b.status) ? 'b-critical' : /Yayında/.test(b.status) ? 'b-ok' : 'b-warning'}`}>{b.status}</span>
            </div>
          ))}
          {gameBuilds.length === 0 && <div className="empty">{hasStore || demo ? 'Henüz build bilgisi yok.' : 'Mağazalar bağlanınca build ve inceleme durumu burada görünecek.'}</div>}
        </div>
      </section>

      {!demo && (!connected.google_play || !connected.app_store) && (
        <section className="grid g-2">
          {!connected.google_play && game.platforms.includes('android') && <Needs source="google_play" />}
          {!connected.app_store && game.platforms.includes('ios') && <Needs source="app_store" />}
        </section>
      )}
    </>
  )
}
