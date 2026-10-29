import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Users, MonitorSmartphone, Globe2, TrendingUp } from 'lucide-react'
import { useData } from '../lib/data'
import { supabase, isDemo } from '../lib/supabase'
import { countryName, currencySymbol, dayLabel, int, localIso, money2, pct, short } from '../lib/format'
import { BarList, GameLogo } from './ui'
import { gameById } from '../data/sample'
import Select from './Select'

// Reklam panosu: platform sekmeleri (Google Ads, Meta …) ve altında oyun seçimi; harcama, sonuçlar ve hedef kitle.
// Veriler USD saklanır; ekranda seçili para birimine çevrilir. Kırılımlar (yaş, platform, ülke) son 30 gündür.

interface CampaignDay {
  platform: string
  external_id: string
  game_id: string | null
  name: string
  status: string | null
  date: string
  spend: number
  impressions: number
  clicks: number
  installs: number
  results: number | null
  result_type: string | null
}

interface Breakdown {
  campaign_id: string
  dimension: 'age_gender' | 'placement' | 'country'
  key: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  results: number
}

// Doğrulanmış kategorik palet (koyu zemin): 1. mavi, 2. turuncu
const MALE = '#3987e5'
const FEMALE = '#d95926'

const statusText: Record<string, [string, string]> = {
  ACTIVE: ['Yayında', 'b-ok'],
  ENABLED: ['Yayında', 'b-ok'], // Google Ads
  REMOVED: ['Silindi', 'b-muted'], // Google Ads
  PAUSED: ['Durduruldu', 'b-muted'],
  CAMPAIGN_PAUSED: ['Durduruldu', 'b-muted'],
  ADSET_PAUSED: ['Durduruldu', 'b-muted'],
  IN_PROCESS: ['İnceleniyor', 'b-warning'],
  WITH_ISSUES: ['Sorunlu', 'b-warning'],
  DISAPPROVED: ['Reddedildi', 'b-warning'],
  ARCHIVED: ['Arşivde', 'b-muted'],
  DELETED: ['Silindi', 'b-muted'],
}
export const platformName: Record<string, string> = { meta: 'Meta', tiktok: 'TikTok', google_ads: 'Google Ads', apple_ads: 'Apple Ads', unity_ads: 'Unity Ads' }
const platformColor: Record<string, string> = { meta: '#3987e5', google_ads: '#E8C07A', tiktok: '#d95926', apple_ads: '#c8c8c8', unity_ads: '#8FD3AE' }
const placementName: Record<string, string> = {
  feed: 'Akış', instagram_stories: 'Hikâyeler', instagram_reels: 'Reels', instagram_explore: 'Keşfet', instagram_explore_grid_home: 'Keşfet',
  instagram_profile_feed: 'Profil akışı', facebook_reels: 'Reels', facebook_stories: 'Hikâyeler', marketplace: 'Marketplace',
  video_feeds: 'Video akışı', search: 'Arama', an_classic: 'Uygulamalar', rewarded_video: 'Ödüllü video', messenger_inbox: 'Gelen kutusu',
  instream_video: 'Video arası', right_hand_column: 'Sağ sütun', threads_feed: 'Akış',
}
const pubName: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads' }

const daysAgo = (n: number) => localIso(new Date(Date.now() - n * 86400000))

function useAdData() {
  const [rows, setRows] = useState<CampaignDay[]>([])
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([])
  const [loading, setLoading] = useState(!isDemo)
  useEffect(() => {
    if (isDemo) return
    Promise.all([
      supabase!.from('campaigns').select('*').gte('date', daysAgo(59)),
      supabase!.from('ad_breakdowns').select('campaign_id,dimension,key,spend,impressions,clicks,reach,results'),
    ]).then(([c, b]) => {
      setRows((c.data as CampaignDay[]) ?? [])
      setBreakdowns((b.data as Breakdown[]) ?? [])
      setLoading(false)
    })
  }, [])
  return { rows, breakdowns, loading }
}

function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="muted small">önceki dönem yok</span>
  const p = ((cur - prev) / prev) * 100
  const good = invert ? p <= 0 : p >= 0
  return <span className="small" style={{ color: good ? 'var(--green)' : 'var(--orange)' }}>{p >= 0 ? '▲' : '▼'} {pct(Math.abs(p))} <span className="muted">önceki döneme göre</span></span>
}

function Tip({ active, payload, label, fmt, isDate }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt: (v: number) => string; isDate?: boolean }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tip">
      <b>{isDate && label ? dayLabel(label) : label}</b>
      {payload.map((p) => (
        <div key={p.name}><span className="dot" style={{ background: p.color }} /><span>{p.name}</span><span>{fmt(p.value)}</span></div>
      ))}
    </div>
  )
}

export default function AdDashboard() {
  const { fx, currency, connected, demo } = useData()
  const { rows, breakdowns, loading } = useAdData()
  const [days, setDays] = useState(30)
  const [pick, setPick] = useState('all')
  const [plat, setPlat] = useState('all')
  const [game, setGame] = useState('all')

  const dates = Object.keys(fx).sort()
  const latest = dates.length ? fx[dates[dates.length - 1]] : 1
  const rate = (d?: string) => (currency === 'TRY' ? (d && fx[d]) || latest : 1)

  // Platform sekmesi ve oyun seçimi: önce platform, sonra o platformdaki oyun
  const platforms = useMemo(() => [...new Set(rows.map((r) => r.platform))].sort(), [rows])
  const inPlat = rows.filter((r) => plat === 'all' || r.platform === plat)
  const gamesHere = [...new Set(inPlat.map((r) => r.game_id).filter((g): g is string => !!g))]
  const base = inPlat.filter((r) => game === 'all' || r.game_id === game)
  const baseIds = new Set(base.map((r) => r.external_id))
  const spendOf = (list: CampaignDay[]) => list.filter((r) => r.date >= daysAgo(days - 1)).reduce((a, r) => a + Number(r.spend) * rate(r.date), 0)
  const choosePlat = (p: string) => { setPlat(p); setGame('all'); setPick('all') }
  const chooseGame = (g: string) => { setGame(g); setPick('all') }

  const campaignsAll = useMemo(() => {
    const m = new Map<string, CampaignDay>()
    for (const r of base) {
      const k = `${r.platform}:${r.external_id}`
      const a = m.get(k)
      if (!a || r.date > a.date) m.set(k, r)
    }
    return [...m.values()]
  }, [base]) // eslint-disable-line react-hooks/exhaustive-deps

  const inPick = (r: { external_id?: string; campaign_id?: string }) => pick === 'all' || (r.external_id ?? r.campaign_id) === pick
  const start = daysAgo(days - 1)
  const prevStart = daysAgo(days * 2 - 1)
  const cur = base.filter((r) => r.date >= start && inPick(r))
  const prev = base.filter((r) => r.date >= prevStart && r.date < start && inPick(r))

  const sum = (list: CampaignDay[]) =>
    list.reduce(
      (a, r) => ({
        spend: a.spend + Number(r.spend) * rate(r.date),
        impressions: a.impressions + Number(r.impressions),
        clicks: a.clicks + Number(r.clicks),
        results: a.results + Number(r.results ?? 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, results: 0 },
    )
  const t = sum(cur)
  const p = sum(prev)
  const resultTypes = [...new Set(cur.filter((r) => r.results).map((r) => r.result_type).filter(Boolean))]
  const resultLabel = resultTypes.length === 1 ? resultTypes[0]! : 'Sonuç'

  // Günlük seri (boş günler 0)
  const daily = useMemo(() => {
    const out: { date: string; spend: number; results: number; clicks: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i)
      const list = cur.filter((r) => r.date === d)
      out.push({ date: d, spend: list.reduce((a, r) => a + Number(r.spend) * rate(d), 0), results: list.reduce((a, r) => a + Number(r.results ?? 0), 0), clicks: list.reduce((a, r) => a + Number(r.clicks), 0) })
    }
    return out
  }, [cur, days]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kırılımlar (son 30 gün)
  const bd = breakdowns.filter((b) => baseIds.has(b.campaign_id) && inPick(b))
  const ageMap = new Map<string, { age: string; Erkek: number; Kadın: number; spend: number }>()
  for (const b of bd.filter((b) => b.dimension === 'age_gender')) {
    const [age, gender] = b.key.split('|')
    if (age === 'Unknown') continue
    const a = ageMap.get(age) ?? { age, Erkek: 0, Kadın: 0, spend: 0 }
    if (gender === 'male') a.Erkek += b.results || b.clicks
    else if (gender === 'female') a.Kadın += b.results || b.clicks
    a.spend += Number(b.spend) * rate()
    ageMap.set(age, a)
  }
  const ages = [...ageMap.values()].sort((a, b) => a.age.localeCompare(b.age))
  const useClicks = bd.every((b) => !b.results)
  const metricName = useClicks ? 'tıklama' : resultLabel.toLowerCase()

  // En iyi grup: en çok sonuç getiren yaş-cinsiyet
  let best: { label: string; value: number; share: number; cost: number } | null = null
  const ageGender = bd.filter((b) => b.dimension === 'age_gender')
  const agTotal = ageGender.reduce((a, b) => a + (b.results || b.clicks), 0)
  const agMap = new Map<string, { v: number; s: number }>()
  for (const b of ageGender) {
    const x = agMap.get(b.key) ?? { v: 0, s: 0 }
    x.v += b.results || b.clicks
    x.s += Number(b.spend) * rate()
    agMap.set(b.key, x)
  }
  for (const [k, x] of agMap) {
    if (!best || x.v > best.value) {
      const [age, g] = k.split('|')
      best = { label: `${g === 'male' ? 'Erkek' : g === 'female' ? 'Kadın' : 'Bilinmeyen'} ${age}`, value: x.v, share: agTotal ? (x.v / agTotal) * 100 : 0, cost: x.v ? x.s / x.v : 0 }
    }
  }
  const male = ageGender.filter((b) => b.key.endsWith('|male')).reduce((a, b) => a + (b.results || b.clicks), 0)

  const group = (dim: Breakdown['dimension'], label: (k: string) => { label: string; sub?: string }) => {
    const m = new Map<string, { label: string; sub?: string; value: number; spend: number }>()
    for (const b of bd.filter((b) => b.dimension === dim)) {
      const l = label(b.key)
      const id = l.label + (l.sub ?? '')
      const a = m.get(id) ?? { ...l, value: 0, spend: 0 }
      a.value += b.results || b.clicks
      a.spend += Number(b.spend) * rate()
      m.set(id, a)
    }
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 7).map((x) => ({ ...x, extra: `${money2(x.spend)} harcama · ${metricName} başı ${x.value ? money2(x.spend / x.value) : '—'}` }))
  }
  const placements = group('placement', (k) => {
    const [pub, pos] = k.split('|')
    return { label: pubName[pub] ?? pub, sub: placementName[pos] ?? pos }
  })
  const countries = group('country', (k) => ({ label: countryName(k) }))

  const table = campaignsAll
    .map((c) => {
      const list = cur.filter((r) => r.external_id === c.external_id && r.platform === c.platform)
      return { ...c, ...sum(list) }
    })
    .filter((c) => c.spend > 0 || c.status === 'ACTIVE' || c.status === 'ENABLED')
    .sort((a, b) => b.spend - a.spend)

  if (demo) return null
  if (!loading && rows.length === 0) {
    return (
      <section className="card">
        <div className="card-title">Reklam panosu</div>
        <div className="empty" style={{ whiteSpace: 'normal' }}>
          {connected.meta ? 'Bağlı reklam hesaplarında son 60 günde harcama yok.' : 'Henüz bağlı reklam hesabı yok. Ayarlar › Meta adımlarını izle.'}
        </div>
      </section>
    )
  }

  const kpis = [
    { label: 'Harcama', value: money2(t.spend), delta: <Delta cur={t.spend} prev={p.spend} invert /> },
    { label: resultLabel, value: int(t.results), delta: <Delta cur={t.results} prev={p.results} /> },
    { label: `${resultLabel} başına`, value: t.results ? money2(t.spend / t.results) : '—', delta: t.results && p.results ? <Delta cur={t.spend / t.results} prev={p.spend / p.results} invert /> : <span className="muted small">—</span> },
    { label: 'Tıklama · TO', value: int(t.clicks), delta: <span className="muted small">Tıklama oranı {pct(t.impressions ? (t.clicks / t.impressions) * 100 : 0, 2)}</span> },
    { label: 'Gösterim · BGBM', value: short(t.impressions), delta: <span className="muted small">1000 gösterim {t.impressions ? money2((t.spend / t.impressions) * 1000) : '—'}</span> },
  ]

  return (
    <>
      <div className="ad-tabs" role="tablist" aria-label="Reklam platformu">
        {['all', ...platforms].map((pl) => (
          <button key={pl} type="button" role="tab" aria-selected={plat === pl} className={`ad-tab ${plat === pl ? 'on' : ''}`} onClick={() => choosePlat(pl)}>
            <span className="ad-dot" style={{ background: pl === 'all' ? 'var(--green)' : platformColor[pl] ?? '#888' }} />
            <span className="ad-tab-name">{pl === 'all' ? 'Tüm platformlar' : platformName[pl] ?? pl}</span>
            <span className="ad-tab-val">{money2(spendOf(pl === 'all' ? rows : rows.filter((r) => r.platform === pl)))}</span>
          </button>
        ))}
      </div>
      {gamesHere.length > 0 && (
        <div className="flex wrap" style={{ gap: 6 }}>
          <button type="button" className={`chip-btn ${game === 'all' ? 'on' : ''}`} onClick={() => chooseGame('all')}>Tüm oyunlar</button>
          {gamesHere.map((g) => (
            <button key={g} type="button" className={`chip-btn ${game === g ? 'on' : ''}`} onClick={() => chooseGame(g)}><GameLogo id={g} size={18} /> {gameById(g)?.name ?? g}</button>
          ))}
        </div>
      )}

      <div className="flex wrap between" style={{ gap: 10 }}>
        <div className="seg">
          {[7, 30].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>Son {d} gün</button>)}
        </div>
        <Select className="select" style={{ width: 'auto', minWidth: 220 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Kampanya">
          <option value="all">Tüm kampanyalar</option>
          {campaignsAll.map((c) => <option key={c.external_id} value={c.external_id}>{c.name}</option>)}
        </Select>
      </div>

      <section className="kpi-row">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <span className="stat-label">{k.label}</span>
            <span className="kpi-value">{k.value}</span>
            {k.delta}
          </div>
        ))}
      </section>

      <section className="grid g-2" style={{ alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-title flex" style={{ gap: 8 }}><TrendingUp size={16} /> Günlük harcama</div>
          <div className="card-sub">Son {days} gün · {currency === 'TRY' ? 'her günün kuruyla TL' : 'USD'}</div>
          <div style={{ height: 220, marginTop: 10 }}>
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ left: -10, right: 4, top: 6 }} barCategoryGap={2}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => currencySymbol() + short(v)} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<Tip fmt={money2} isDate />} />
                <Bar dataKey="spend" name="Harcama" fill="#8FD3AE" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-title flex" style={{ gap: 8 }}><TrendingUp size={16} /> Günlük {resultLabel.toLowerCase()}</div>
          <div className="card-sub">Son {days} gün · platformun saydığı sonuçlar</div>
          <div style={{ height: 220, marginTop: 10 }}>
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ left: -18, right: 4, top: 6 }} barCategoryGap={2}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<Tip fmt={int} isDate />} />
                <Bar dataKey="results" name={resultLabel} fill="#E8C07A" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {ages.length > 0 && <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title flex" style={{ gap: 8 }}><Users size={16} /> Hedef kitle: reklamına kim tepki veriyor?</div>
            <div className="card-sub">Son 30 gün · yaş ve cinsiyete göre {metricName}</div>
          </div>
        </div>
        {(
          <div className="audience">
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={ages} margin={{ left: -18, right: 4, top: 6 }} barGap={2}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="age" tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<Tip fmt={int} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#c8c8c8' }} />
                  <Bar dataKey="Erkek" fill={MALE} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="Kadın" fill={FEMALE} radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="audience-facts">
              {best && (
                <div className="inner">
                  <div className="muted small">En iyi tepki veren grup</div>
                  <div style={{ fontSize: 22, fontWeight: 300, margin: '4px 0' }}>{best.label}</div>
                  <div className="small">{metricName} payı <b>{pct(best.share, 0)}</b> · {metricName} başı <b>{money2(best.cost)}</b></div>
                </div>
              )}
              <div className="inner">
                <div className="muted small">Cinsiyet dağılımı</div>
                <div className="gender-bar" role="img" aria-label={`Erkek ${pct(agTotal ? (male / agTotal) * 100 : 0, 0)}`}>
                  <span style={{ width: `${agTotal ? (male / agTotal) * 100 : 50}%`, background: MALE }} />
                  <span style={{ flex: 1, background: FEMALE }} />
                </div>
                <div className="flex between small" style={{ marginTop: 6 }}>
                  <span><span className="dot" style={{ background: MALE }} /> Erkek {pct(agTotal ? (male / agTotal) * 100 : 0, 0)}</span>
                  <span>Kadın {pct(agTotal ? 100 - (male / agTotal) * 100 : 0, 0)} <span className="dot" style={{ background: FEMALE }} /></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>}

      {(placements.length > 0 || countries.length > 0) && <section className="grid g-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title flex" style={{ gap: 8 }}><MonitorSmartphone size={16} /> Nerede gösterildi?</div>
          <div className="card-sub" style={{ marginBottom: 12 }}>Platform ve yerleşime göre {metricName} · son 30 gün</div>
          <BarList items={placements} fmt={int} />
        </div>
        <div className="card">
          <div className="card-title flex" style={{ gap: 8 }}><Globe2 size={16} /> Hangi ülkeler?</div>
          <div className="card-sub" style={{ marginBottom: 12 }}>Ülkeye göre {metricName} · son 30 gün</div>
          <BarList items={countries} fmt={int} />
        </div>
      </section>}

      <section className="card">
        <div className="card-title">Kampanyalar</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>Son {days} gün · satıra tıkla, pano o kampanyaya süzülsün</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kampanya</th><th>Platform</th><th className="num">Harcama</th><th className="num">Sonuç</th><th className="num">Sonuç başı</th><th className="num">Tıklama</th><th className="num">TO</th><th className="num">Gösterim</th><th>Durum</th></tr></thead>
            <tbody>
              {table.length === 0 && <tr><td colSpan={9} className="empty">Son {days} günde harcama yapan kampanya yok.</td></tr>}
              {table.map((c) => {
                const [st, cls] = statusText[c.status ?? ''] ?? [c.status ?? '—', 'b-muted']
                return (
                  <tr key={c.platform + c.external_id} className={pick === c.external_id ? 'on' : ''} onClick={() => setPick(pick === c.external_id ? 'all' : c.external_id)} style={{ cursor: 'pointer' }}>
                    <td>{c.game_id ? <span className="game-chip"><GameLogo id={c.game_id} size={26} /> {c.name}</span> : c.name}</td>
                    <td>{platformName[c.platform] ?? c.platform}</td>
                    <td className="num">{money2(c.spend)}</td>
                    <td className="num">{c.results ? <>{int(c.results)} <span className="muted small">{c.result_type}</span></> : '—'}</td>
                    <td className="num">{c.results ? money2(c.spend / c.results) : '—'}</td>
                    <td className="num">{int(c.clicks)}</td>
                    <td className="num">{pct(c.impressions ? (c.clicks / c.impressions) * 100 : 0, 2)}</td>
                    <td className="num">{int(c.impressions)}</td>
                    <td><span className={`badge ${cls}`}>{st}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
