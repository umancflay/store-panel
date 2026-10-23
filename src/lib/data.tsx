import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  adPlans as sampleAdPlans, alerts as sampleAlerts, builds as sampleBuilds, isoDay, recommendations as sampleRecs,
  reviews as sampleReviews, sampleAdUnits, sampleCountries, sampleDaily, sampleGames, setGames,
  type AdPlan, type AdUnit, type Alert, type Build, type Country, type DailyRow, type Game, type Platform,
  type Recommendation, type Review, type ReviewCategory,
} from '../data/sample'
import { supabase, isDemo } from './supabase'

// Panelin veri kaynağı.
// Demo mod (Supabase ayarlı değil): örnek veriler.
// Gerçek mod: sadece Supabase'deki gerçek veriler. Bağlı olmayan kaynakların yerinde
// "nasıl bağlanır" kartı (components/Needs.tsx) gösterilir; örnek veri asla gösterilmez.

export interface Connection {
  source: string
  status: string
  last_sync_at: string | null
  message: string | null
}

interface DataState {
  loading: boolean
  demo: boolean
  games: Game[]
  daily: DailyRow[]
  adUnits: AdUnit[]
  countries: Country[]
  alerts: Alert[]
  reviews: Review[]
  builds: Build[]
  recs: Recommendation[]
  adPlans: AdPlan[]
  // Kaynak bağlı mı? (admob, google_play, app_store, gmail, claude, google_ads …)
  connected: Record<string, boolean>
  hasStore: boolean
  connections: Connection[]
  lastRun: { job: string; status: string; finished_at: string | null; message: string | null } | null
  reload: () => void
}

const allConnected = { admob: true, google_play: true, app_store: true, gmail: true, claude: true }

const sample: DataState = {
  loading: false,
  demo: true,
  games: sampleGames,
  daily: sampleDaily,
  adUnits: sampleAdUnits,
  countries: sampleCountries,
  alerts: sampleAlerts,
  reviews: sampleReviews,
  builds: sampleBuilds,
  recs: sampleRecs,
  adPlans: sampleAdPlans,
  connected: allConnected,
  hasStore: true,
  connections: [],
  lastRun: null,
  reload: () => {},
}

const empty: DataState = {
  ...sample,
  loading: true,
  demo: false,
  games: [],
  daily: [],
  adUnits: [],
  countries: [],
  alerts: [],
  reviews: [],
  builds: [],
  recs: [],
  adPlans: [],
  connected: {},
  hasStore: false,
}

const DataContext = createContext<DataState>(sample)

const colors = ['#0075ff', '#01b574', '#a855f7', '#ffa53d', '#2cd9ff', '#ff4d5e', '#f472b6', '#facc15']

export const formatLabels: Record<string, string> = {
  banner: 'Banner',
  interstitial: 'Geçiş (Interstitial)',
  rewarded: 'Ödüllü (Rewarded)',
  rewarded_interstitial: 'Ödüllü geçiş',
  app_open: 'Uygulama açılışı',
  native: 'Native',
}

const regionNames = new Intl.DisplayNames(['tr'], { type: 'region' })
const countryName = (code: string) => {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

type Row = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)
const numOrNull = (v: unknown) => (v == null ? null : Number(v))
const ecpm = (rev: number, imp: number) => (imp ? (rev / imp) * 1000 : 0)
const fill = (m: number, r: number) => (r ? (m / r) * 100 : 0)

async function loadLive(): Promise<Omit<DataState, 'reload'>> {
  const db = supabase!
  const cur = { from: isoDay(30), to: isoDay(1) }
  const prev = { from: isoDay(60), to: isoDay(31) }

  const results = await Promise.all([
    db.from('connections').select('source,status,last_sync_at,message'),
    db.from('games').select('id,name,genre,platforms').eq('active', true).order('created_at'),
    db.from('sync_runs').select('job,status,finished_at,message').order('started_at', { ascending: false }).limit(1),
    db.rpc('admob_by_day', { p_from: isoDay(60) }),
    db.rpc('admob_by_country', { p_from: cur.from, p_to: cur.to }),
    db.rpc('admob_by_country', { p_from: prev.from, p_to: prev.to }),
    db.rpc('admob_by_unit', { p_from: cur.from, p_to: cur.to }),
    db.rpc('admob_by_unit', { p_from: prev.from, p_to: prev.to }),
    db.rpc('store_by_day', { p_from: isoDay(60) }),
    db.from('alerts').select('*').order('created_at', { ascending: false }).limit(200),
    db.from('reviews').select('*').order('created_at', { ascending: false }).limit(300),
    db.from('builds').select('*').order('updated_at', { ascending: false }),
    db.from('recommendations').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('ad_plans').select('game_id,content,created_at').order('created_at', { ascending: false }),
  ])
  // store_by_day 3. aşama SQL'i çalıştırılmadıysa yoksay; diğer hatalar gerçek hata
  const err = results.find((r, i) => r.error && i !== 8)?.error
  if (err) throw err
  const [conns, gamesRes, runs, byDay, cNow, cPrev, uNow, uPrev, store, alertsRes, reviewsRes, buildsRes, recsRes, plansRes] = results

  const connections = (conns.data ?? []) as Connection[]
  const connected = Object.fromEntries(connections.map((c) => [c.source, c.status === 'connected']))

  const games: Game[] = ((gamesRes.data ?? []) as Row[]).map((g, i) => ({
    id: g.id as string,
    name: g.name as string,
    genre: (g.genre as string) ?? '',
    platforms: ((g.platforms as Platform[]) ?? []).sort(),
    color: colors[i % colors.length],
  }))

  // AdMob ve mağaza verisini gün/oyun/platform bazında birleştir. Bugünün yarım verisi alınmaz.
  const today = isoDay(0)
  const merged = new Map<string, DailyRow>()
  const rowFor = (date: string, gameId: string, platform: Platform) => {
    const k = `${date}|${gameId}|${platform}`
    if (!merged.has(k)) {
      merged.set(k, { date, gameId, platform, adRevenue: 0, impressions: 0, requests: 0, matched: 0, downloads: 0, iapRevenue: 0, crashRate: null, anrRate: null, rating: null })
    }
    return merged.get(k)!
  }
  for (const r of (byDay.data ?? []) as Row[]) {
    if ((r.date as string) >= today) continue
    Object.assign(rowFor(r.date as string, r.game_id as string, r.platform as Platform), {
      adRevenue: num(r.revenue), impressions: num(r.impressions), requests: num(r.requests), matched: num(r.matched),
    })
  }
  for (const r of (store.data ?? []) as Row[]) {
    if ((r.date as string) >= today) continue
    Object.assign(rowFor(r.date as string, r.game_id as string, r.platform as Platform), {
      downloads: num(r.downloads), iapRevenue: num(r.iap_revenue), rating: numOrNull(r.rating), crashRate: numOrNull(r.crash_rate), anrRate: numOrNull(r.anr_rate),
    })
  }
  const daily = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))

  const prevCountry = new Map(((cPrev.data ?? []) as Row[]).map((c) => [c.country, c]))
  const countries: Country[] = ((cNow.data ?? []) as Row[]).map((c) => {
    const p = prevCountry.get(c.country)
    return {
      code: c.country as string,
      name: countryName(c.country as string),
      revenue: num(c.revenue),
      impressions: num(c.impressions),
      ecpm: ecpm(num(c.revenue), num(c.impressions)),
      ecpmPrev: p ? ecpm(num(p.revenue), num(p.impressions)) : 0,
    }
  })

  const prevUnit = new Map(((uPrev.data ?? []) as Row[]).map((u) => [u.ad_unit_id, u]))
  const adUnits: AdUnit[] = ((uNow.data ?? []) as Row[]).map((u) => {
    const p = prevUnit.get(u.ad_unit_id)
    return {
      id: u.ad_unit_id as string,
      gameId: u.game_id as string,
      platform: u.platform as Platform,
      name: (u.ad_unit_name as string) || (u.ad_unit_id as string),
      format: formatLabels[u.ad_format as string] ?? (u.ad_format as string),
      impressions: num(u.impressions),
      revenue: num(u.revenue),
      ecpm: ecpm(num(u.revenue), num(u.impressions)),
      ecpmPrev: p ? ecpm(num(p.revenue), num(p.impressions)) : 0,
      fillRate: fill(num(u.matched), num(u.requests)),
      fillPrev: p ? fill(num(p.matched), num(p.requests)) : 0,
    }
  })

  // Uyarı metni satır satır adımlar; "Unity:" ile başlayan satırlar Unity bölümüne gider
  const alerts: Alert[] = ((alertsRes.data ?? []) as Row[]).map((a) => {
    const lines = ((a.how_to_fix as string) ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    return {
      id: a.id as number,
      level: a.level as Alert['level'],
      source: a.source as Alert['source'],
      gameId: (a.game_id as string) ?? null,
      title: a.title as string,
      body: (a.body as string) ?? '',
      howToFix: lines.filter((l) => !/^unity:/i.test(l)),
      unity: lines.filter((l) => /^unity:/i.test(l)).map((l) => l.replace(/^unity:\s*/i, '')),
      consoleUrl: (a.console_url as string) ?? '',
      deadline: (a.deadline as string) ?? null,
      createdAt: (a.created_at as string).slice(0, 10),
      status: a.status as Alert['status'],
    }
  })

  const reviews: Review[] = ((reviewsRes.data ?? []) as Row[]).map((r) => ({
    id: r.id as number,
    gameId: r.game_id as string,
    platform: r.platform as Platform,
    author: (r.author as string) ?? 'Anonim',
    rating: num(r.rating),
    title: (r.title as string) ?? null,
    body: (r.body as string) ?? '',
    date: (r.created_at as string).slice(0, 10),
    category: (r.ai_category as ReviewCategory) ?? null,
    version: (r.app_version as string) ?? '',
    reply: (r.store_reply as string) ?? null,
  }))

  // Her oyun/platform için en son build
  const seen = new Set<string>()
  const builds: Build[] = []
  for (const b of (buildsRes.data ?? []) as Row[]) {
    const k = `${b.game_id}|${b.platform}`
    if (seen.has(k)) continue
    seen.add(k)
    builds.push({
      gameId: b.game_id as string,
      platform: b.platform as Platform,
      version: b.version as string,
      build: (b.build_number as string) ?? '',
      status: (b.status as string) ?? '',
      review: (b.review_status as string) ?? '',
      date: (b.updated_at as string).slice(0, 10),
    })
  }

  const recs: Recommendation[] = ((recsRes.data ?? []) as Row[])
    .filter((r) => ['pending', 'approved', 'rejected'].includes(r.status as string))
    .map((r) => ({
      id: r.id as number,
      kind: r.kind as Recommendation['kind'],
      gameId: r.game_id as string,
      title: r.title as string,
      detail: ((r.details as Row)?.summary as string) ?? '',
      cost: r.estimated_cost == null ? null : Number(r.estimated_cost),
      status: r.status as Recommendation['status'],
    }))

  // Her oyun için en son reklam planı
  const planSeen = new Set<string>()
  const adPlans: AdPlan[] = []
  for (const p of (plansRes.data ?? []) as Row[]) {
    if (planSeen.has(p.game_id as string)) continue
    planSeen.add(p.game_id as string)
    adPlans.push({ ...(p.content as AdPlan), gameId: p.game_id as string })
  }

  return {
    loading: false,
    demo: false,
    games,
    daily,
    adUnits,
    countries,
    alerts,
    reviews,
    builds,
    recs,
    adPlans,
    connected,
    hasStore: Boolean(connected.google_play || connected.app_store),
    connections,
    lastRun: (runs.data?.[0] as DataState['lastRun']) ?? null,
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<DataState, 'reload'>>(isDemo ? sample : empty)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (isDemo) return
    loadLive()
      .then((s) => {
        setGames(s.games)
        setState(s)
      })
      .catch((e) => {
        console.error('Veri yüklenemedi', e)
        setState({ ...empty, loading: false })
      })
  }, [version])

  return <DataContext.Provider value={{ ...state, reload: () => setVersion((v) => v + 1) }}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
