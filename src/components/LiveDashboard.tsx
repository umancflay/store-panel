import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isDemo } from '../lib/supabase'
import { useData } from '../lib/data'
import { countryName, int, localIso, money, pct } from '../lib/format'
import { gameById } from '../data/sample'
import LiveGlobe from './LiveGlobe'

// Ana sayfa canlı pano: bugünün parası (her dakika yenilenir), paranın geldiği ülkeler (küre), ülke sıralaması,
// kitle (Meta yaş-cinsiyet; yoksa reklam türleri) ve oyun başına gelir halkaları. Sadece gerçek veri; yoksa kart gizlenir.

const LIVE_MS = 60_000
const ORANGE = '#ff7a3c'
const AMBER = '#f5b546'
const RING = ['#ff7a3c', '#f5b546', '#f3efe9', '#c98a5e', '#8c8784', '#5c5755']

type LiveRow = { country: string; game_id: string; revenue: number; revenue_try: number | null; impressions: number }
type AgeRow = { age: string; women: number; men: number }

// Para sayacı: değer değişince yumuşakça sayar
function CountUp({ value, fmt }: { value: number; fmt: (v: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900)
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3))
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{fmt(shown)}</>
}

const ago = (iso?: string | null) => {
  if (!iso) return null
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? 'az önce' : m < 60 ? `${m} dk önce` : `${Math.round(m / 60)} sa önce`
}

export default function LiveDashboard() {
  const { daily, today, countries, adUnits, games, currency, connections, demo, reload } = useData()
  const [live, setLive] = useState<LiveRow[] | null>(null)
  const [ages, setAges] = useState<AgeRow[]>([])
  const [tick, setTick] = useState(0)
  const visible = useMemo(() => new Set(games.map((g) => g.id)), [games])
  const admob = connections.find((c) => c.source === 'admob')

  // Bugünün satırları her dakika; bütün panel verisi 5 dakikada bir tazelenir
  useEffect(() => {
    if (isDemo) return
    const load = () => supabase!.from('admob_daily').select('country,game_id,revenue,revenue_try,impressions').eq('date', localIso(new Date()))
      .then(({ data }) => { setLive((data as LiveRow[]) ?? []); setTick((t) => t + 1) })
    load()
    const a = setInterval(load, LIVE_MS)
    const b = setInterval(reload, 5 * LIVE_MS)
    return () => { clearInterval(a); clearInterval(b) }
  }, [reload])
  useEffect(() => {
    if (isDemo) return
    supabase!.from('ad_breakdowns').select('key,results,clicks').eq('dimension', 'age_gender').then(({ data }) => {
      const m = new Map<string, AgeRow>()
      for (const r of (data as { key: string; results: number; clicks: number }[]) ?? []) {
        const [age, g] = r.key.split('|')
        if (!age || age === 'Unknown') continue
        const e = m.get(age) ?? { age, women: 0, men: 0 }
        const v = Number(r.results || r.clicks || 0)
        if (g === 'female') e.women += v
        else if (g === 'male') e.men += v
        m.set(age, e)
      }
      setAges([...m.values()].filter((x) => x.women + x.men > 0).sort((a, b) => a.age.localeCompare(b.age)))
    })
  }, [])

  const rev = (r: LiveRow) => Number(currency === 'TRY' && r.revenue_try != null ? r.revenue_try : r.revenue)
  const liveRows = (live ?? []).filter((r) => visible.has(r.game_id))
  const todayTotal = live ? liveRows.reduce((a, r) => a + rev(r), 0) : today.reduce((a, r) => a + r.adRevenue, 0)
  const todayImps = live ? liveRows.reduce((a, r) => a + Number(r.impressions), 0) : today.reduce((a, r) => a + r.impressions, 0)

  // Dün, bu ay, son 30 gün (günlük satırlar seçili para biriminde)
  const dayRev = (d: string) => daily.filter((r) => r.date === d).reduce((a, r) => a + r.adRevenue + r.iapRevenue, 0)
  const yIso = localIso(new Date(Date.now() - 86400000))
  const monthStart = localIso(new Date()).slice(0, 8) + '01'
  const d30 = localIso(new Date(Date.now() - 30 * 86400000))
  const month = daily.filter((r) => r.date >= monthStart).reduce((a, r) => a + r.adRevenue + r.iapRevenue, 0) + todayTotal
  const last30 = daily.filter((r) => r.date >= d30).reduce((a, r) => a + r.adRevenue + r.iapRevenue, 0)

  // Bugün ülkeler (canlı) ve son 30 gün ülkeler
  const todayCountries = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of liveRows) m.set(r.country, (m.get(r.country) ?? 0) + rev(r))
    return [...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [tick, currency]) // eslint-disable-line react-hooks/exhaustive-deps
  const topCountries = [...countries].filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
  const totalCountries = countries.reduce((a, c) => a + c.revenue, 0)
  const marks = topCountries.map((c) => ({ code: c.code, value: c.revenue, label: `${c.name} ${pct(totalCountries ? (c.revenue / totalCountries) * 100 : 0, 0)}` }))

  // Oyun başına gelir payı (30 gün)
  const byGame = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of daily) if (r.date >= d30) m.set(r.gameId, (m.get(r.gameId) ?? 0) + r.adRevenue + r.iapRevenue)
    const list = [...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    const sum = list.reduce((a, [, v]) => a + v, 0)
    return list.slice(0, 6).map(([id, v]) => ({ id, name: gameById(id)?.name ?? id, share: sum ? (v / sum) * 100 : 0 }))
  }, [daily, d30])

  // Reklam türleri (kitle verisi yoksa)
  const formats = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of adUnits) m.set(u.format || 'Diğer', (m.get(u.format || 'Diğer') ?? 0) + u.revenue)
    const list = [...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    const sum = list.reduce((a, [, v]) => a + v, 0)
    return list.map(([name, v]) => ({ name, v, share: sum ? (v / sum) * 100 : 0 }))
  }, [adUnits])

  const ageTotal = ages.reduce((a, x) => a + x.women + x.men, 0)
  const ageMax = Math.max(...ages.map((x) => Math.max(x.women, x.men)), 1)
  const women = ages.reduce((a, x) => a + x.women, 0)

  return (
    <section className="live-dash" aria-label="Canlı pano">
      <div className="live-head">
        <span className="live-badge"><span className="live-dot" /> CANLI</span>
        <span className="muted small">
          {demo ? 'Demo verisi' : `AdMob ${ago(admob?.last_sync_at) ?? '—'} güncellendi · ekran her dakika yenilenir`}
        </span>
      </div>

      <div className="money-row">
        <div className="money-tile big">
          <span>Bugün şimdiye kadar</span>
          <b><CountUp value={todayTotal} fmt={money} /></b>
          <small>{int(todayImps)} gösterim</small>
        </div>
        <div className="money-tile"><span>Dün</span><b>{money(dayRev(yIso))}</b></div>
        <div className="money-tile"><span>Bu ay</span><b>{money(month)}</b></div>
        <div className="money-tile"><span>Son 30 gün</span><b>{money(last30)}</b></div>
      </div>

      {topCountries.length > 0 && (
        <div className="live-grid">
          <div className="card live-card globe-card">
            <div className="lc-head"><div><b>Para nereden geliyor</b><span>Ülkelere göre reklam geliri, son 30 gün · küreyi sürükleyip çevir</span></div></div>
            <div className="globe-wrap">
              <LiveGlobe marks={marks} />
              <div className="today-feed">
                <span className="muted small">Bugün en çok kazandıran</span>
                {todayCountries.length === 0 && <div className="feed-item"><b>Henüz gelir yok</b><span>Gün yeni başladı</span></div>}
                {todayCountries.map(([code, v], i) => (
                  <div key={code} className={`feed-item ${i === 0 ? 'hot' : ''}`}>
                    <div><b>{countryName(code)}</b><span>{money(v)}</span></div>
                    {i === 0 && <em>şimdi</em>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card live-card">
            <div className="lc-head"><div><b>En çok kazandıran ülkeler</b><span>{topCountries.length} ülke · son 30 gün {money(totalCountries)}</span></div></div>
            <div className="country-bars">
              {topCountries.map((c) => (
                <div key={c.code} className="cbar">
                  <div className="flex between"><span><b>{c.name}</b> <i>{int(c.impressions)} gösterim</i></span><span>{money(c.revenue)}</span></div>
                  <div className="cbar-track"><span style={{ width: `${(c.revenue / topCountries[0].revenue) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="live-grid two">
        {ages.length > 0 ? (
          <div className="card live-card">
            <div className="lc-head">
              <div><b>Yaş ve cinsiyet</b><span>Meta reklamlarına tepki verenler</span></div>
              <div className="legend"><i style={{ background: ORANGE }} /> Kadın {pct(ageTotal ? (women / ageTotal) * 100 : 0, 1)} <i style={{ background: AMBER }} /> Erkek {pct(ageTotal ? ((ageTotal - women) / ageTotal) * 100 : 0, 1)}</div>
            </div>
            <div className="butterfly">
              {ages.map((x) => (
                <div key={x.age} className="bf-row">
                  <span className="bf-v">{pct(ageTotal ? (x.women / ageTotal) * 100 : 0, 1)}</span>
                  <div className="bf-l"><span style={{ width: `${(x.women / ageMax) * 100}%`, background: ORANGE }} /></div>
                  <b>{x.age}</b>
                  <div className="bf-r"><span style={{ width: `${(x.men / ageMax) * 100}%`, background: AMBER }} /></div>
                  <span className="bf-v">{pct(ageTotal ? (x.men / ageTotal) * 100 : 0, 1)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : formats.length > 0 && (
          <div className="card live-card">
            <div className="lc-head"><div><b>Reklam türleri</b><span>Gelirin hangi reklamdan geldiği, son 30 gün</span></div></div>
            <div className="country-bars">
              {formats.map((f, i) => (
                <div key={f.name} className="cbar">
                  <div className="flex between"><span><b>{f.name}</b></span><span>{money(f.v)} · {pct(f.share, 0)}</span></div>
                  <div className="cbar-track"><span style={{ width: `${f.share}%`, background: i % 2 ? AMBER : ORANGE }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {byGame.length > 0 && (
          <div className="card live-card">
            <div className="lc-head"><div><b>Oyunlar</b><span>Gelir payı, son 30 gün · her halka bir oyun</span></div></div>
            <div className="rings">
              <svg viewBox="0 0 200 200" className="rings-svg" aria-hidden>
                {byGame.map((g, i) => {
                  const r = 88 - i * 13
                  const len = 2 * Math.PI * r
                  return (
                    <g key={g.id}>
                      <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="7" />
                      <circle cx="100" cy="100" r={r} fill="none" stroke={RING[i]} strokeWidth="7" strokeLinecap="round"
                        strokeDasharray={`${(g.share / 100) * len} ${len}`} transform="rotate(-90 100 100)" className="ring-arc" />
                    </g>
                  )
                })}
                <circle cx="100" cy="100" r="7" fill={ORANGE} />
              </svg>
              <div className="ring-legend">
                {byGame.map((g, i) => (
                  <div key={g.id}><i style={{ background: RING[i] }} /> <span>{g.name}</span><b>{pct(g.share, 0)}</b></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
