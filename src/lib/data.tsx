import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  adPlans as sampleAdPlans, alerts as sampleAlerts, builds as sampleBuilds, isoDay, recommendations as sampleRecs,
  reviews as sampleReviews, sampleAdUnits, sampleCountries, sampleDaily, sampleGames, setGames,
  type AdPlan, type AdUnit, type Alert, type Build, type Country, type DailyRow, type Game, type Platform,
  type Recommendation, type Review, type ReviewCategory,
} from '../data/sample'
import { supabase, isDemo } from './supabase'
import { setCurrency, type Currency } from './format'
import { useAuth } from './auth'
import { demoPeople, DEMO_ME } from '../data/demo'
import type { Person } from './types'

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
  people: Person[]
  lastRun: { job: string; status: string; finished_at: string | null; message: string | null } | null
  // Bugünün yarım (şimdiye kadarki) AdMob verisi; grafiklere girmez
  today: DailyRow[]
  // Günlük dolar/TL kuru (tarih → 1 USD kaç TL)
  fx: Record<string, number>
  // Ekranda gösterilen para birimi (Ayarlar'dan değişir)
  currency: Currency
  setCurrencyPref: (c: Currency) => void
  // Gizlenenler dahil tüm oyunlar (Ayarlar › Oyun listesi için)
  allGames: Game[]
  reload: () => void
  setGameHidden: (id: string, hidden: boolean) => Promise<void>
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
  people: demoPeople,
  lastRun: null,
  allGames: sampleGames,
  today: [],
  fx: {},
  currency: 'USD',
  setCurrencyPref: () => {},
  reload: () => {},
  setGameHidden: async () => {},
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

// Yüklenen ham veri (gizli oyunlar dahil); ekrana gitmeden önce gizli oyunlar süzülür
type Raw = Omit<DataState, 'reload' | 'setGameHidden' | 'allGames' | 'currency' | 'setCurrencyPref'>

const colors = ['#FFFFFF', '#8FD3AE', '#E8C07A', '#D9D9D9', '#FF7A55', '#9A9A9A', '#BFE6CF', '#F2D9A8']

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

async function loadLive(): Promise<Raw> {
  const db = supabase!
  const cur = { from: isoDay(30), to: isoDay(1) }
  const prev = { from: isoDay(60), to: isoDay(31) }

  const results = await Promise.all([
    db.from('connections').select('source,status,last_sync_at,message'),
    db.from('games').select('*').eq('active', true).order('created_at'),
    db.from('sync_runs').select('job,status,finished_at,message').order('started_at', { ascending: false }).limit(1),
    db.rpc('admob_by_day', { p_from: isoDay(70) }),
    db.rpc('admob_by_country', { p_from: cur.from, p_to: cur.to }),
    db.rpc('admob_by_country', { p_from: prev.from, p_to: prev.to }),
    db.rpc('admob_by_unit', { p_from: cur.from, p_to: cur.to }),
    db.rpc('admob_by_unit', { p_from: prev.from, p_to: prev.to }),
    db.rpc('store_by_day', { p_from: isoDay(70) }),
    db.from('alerts').select('*').order('created_at', { ascending: false }).limit(200),
    db.from('reviews').select('*').order('created_at', { ascending: false }).limit(300),
    db.from('builds').select('*').order('updated_at', { ascending: false }),
    db.from('recommendations').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('ad_plans').select('game_id,content,created_at').order('created_at', { ascending: false }),
    db.from('admins').select('*'),
    db.from('app_settings').select('value').eq('key', 'fx_usd_try').maybeSingle(),
  ])
  // store_by_day (3. aşama) ve yeni admin sütunları henüz kurulmadıysa yoksay; diğer hatalar gerçek hata
  const err = results.find((r, i) => r.error && i !== 8 && i !== 14 && i !== 15)?.error
  if (err) throw err
  const [conns, gamesRes, runs, byDay, cNow, cPrev, uNow, uPrev, store, alertsRes, reviewsRes, buildsRes, recsRes, plansRes, adminsRes, fxRes] = results
  const fx = ((fxRes.data as { value?: Record<string, number> } | null)?.value ?? {}) as Record<string, number>
  const people: Person[] = ((adminsRes.data ?? []) as Row[]).map((a) => ({
    email: a.email as string,
    name: (a.display_name as string) || (a.email as string).split('@')[0],
    role: (a.role as string) || 'Stüdyo sahibi',
  }))

  const connections = (conns.data ?? []) as Connection[]
  const connected = Object.fromEntries(connections.map((c) => [c.source, c.status === 'connected']))

  const games: Game[] = ((gamesRes.data ?? []) as Row[]).map((g, i) => ({
    id: g.id as string,
    name: g.name as string,
    genre: (g.genre as string) ?? '',
    platforms: ((g.platforms as Platform[]) ?? []).sort(),
    color: colors[i % colors.length],
    goal: g.monthly_goal == null ? null : Number(g.monthly_goal),
    hidden: Boolean(g.hidden),
    icon: (g.icon_url as string) ?? null,
    installs: g.installs == null ? null : Number(g.installs),
    installsLabel: (g.installs_label as string) ?? null,
  }))

  // AdMob ve mağaza verisini gün/oyun/platform bazında birleştir.
  // Bugünün yarım verisi grafiklere girmez; "bugün şimdiye kadar" için ayrı tutulur.
  const today = isoDay(0)
  const todayRows: DailyRow[] = []
  const merged = new Map<string, DailyRow>()
  const rowFor = (date: string, gameId: string, platform: Platform) => {
    const k = `${date}|${gameId}|${platform}`
    if (!merged.has(k)) {
      merged.set(k, { date, gameId, platform, adRevenue: 0, impressions: 0, requests: 0, matched: 0, downloads: 0, iapRevenue: 0, crashRate: null, anrRate: null, rating: null })
    }
    return merged.get(k)!
  }
  for (const r of (byDay.data ?? []) as Row[]) {
    if ((r.date as string) >= today) {
      todayRows.push({ date: r.date as string, gameId: r.game_id as string, platform: r.platform as Platform, adRevenue: num(r.revenue), adRevenueTry: r.has_try ? num(r.revenue_try) : null, impressions: num(r.impressions), requests: num(r.requests), matched: num(r.matched), downloads: 0, iapRevenue: 0, crashRate: null, anrRate: null, rating: null })
      continue
    }
    Object.assign(rowFor(r.date as string, r.game_id as string, r.platform as Platform), {
      adRevenue: num(r.revenue), adRevenueTry: r.has_try ? num(r.revenue_try) : null, impressions: num(r.impressions), requests: num(r.requests), matched: num(r.matched),
    })
  }
  for (const r of (store.data ?? []) as Row[]) {
    if ((r.date as string) >= today) continue
    Object.assign(rowFor(r.date as string, r.game_id as string, r.platform as Platform), {
      downloads: num(r.downloads), iapRevenue: num(r.iap_revenue), rating: numOrNull(r.rating), crashRate: numOrNull(r.crash_rate), anrRate: numOrNull(r.anr_rate),
    })
  }
  const daily = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))

  // AdMob'un TL tutarı tüm satırlarda varsa onu kullan
  const tryOf = (c: Row, p: Row | undefined) =>
    c.has_try ? { revenue: num(c.revenue_try), ecpm: ecpm(num(c.revenue_try), num(c.impressions)), ecpmPrev: p?.has_try ? ecpm(num(p.revenue_try), num(p.impressions)) : null } : undefined

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
      try: tryOf(c, p),
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
      try: tryOf(u, p),
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
    draft: r.reply_status === 'draft' ? ((r.reply_draft as string) ?? null) : null,
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
    adPlans.push({ ...(p.content as AdPlan), gameId: p.game_id as string, createdAt: p.created_at as string })
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
    people,
    lastRun: (runs.data?.[0] as DataState['lastRun']) ?? null,
    today: todayRows,
    fx,
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Raw>(isDemo ? sample : empty)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (isDemo) return
    loadLive()
      .then(setState)
      .catch((e) => {
        console.error('Veri yüklenemedi', e)
        setState({ ...empty, loading: false })
      })
  }, [version])

  // Otomatik yenileme: veri toplama bitince ya da sekmeye dönünce panel kendini günceller
  useEffect(() => {
    if (isDemo) return
    let lastFinish: string | null | undefined
    const check = async () => {
      const { data } = await supabase!.from('sync_runs').select('finished_at').order('started_at', { ascending: false }).limit(1)
      const f = (data?.[0] as { finished_at: string | null } | undefined)?.finished_at ?? null
      if (lastFinish !== undefined && f && f !== lastFinish) setVersion((v) => v + 1)
      lastFinish = f
    }
    check()
    const t = setInterval(check, 2 * 60 * 1000)
    let hiddenAt = 0
    const vis = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) setVersion((v) => v + 1)
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  // Para birimi tercihi bu cihazda saklanır (varsayılan TL)
  const [currency, setCur] = useState<Currency>(() => {
    try {
      return (localStorage.getItem('currency') as Currency) || 'TRY'
    } catch {
      return 'TRY'
    }
  })
  const setCurrencyPref = (c: Currency) => {
    setCur(c)
    try {
      localStorage.setItem('currency', c)
    } catch {
      /* tarayıcı izin vermiyorsa sadece bu oturumda */
    }
  }

  // Gizlenen oyunlar ve onlara ait tüm veriler panelden çıkar; tutarlar seçilen para birimine çevrilir
  const view = useMemo(() => {
    const visible = new Set(state.games.filter((g) => !g.hidden).map((g) => g.id))
    const keep = (id: string | null) => id == null || visible.has(id)
    // Her gün kendi kuruyla çevrilir (AdMob da öyle gösterir); kur yoksa USD kalır
    const days = Object.keys(state.fx).sort()
    const latest = days.length ? state.fx[days[days.length - 1]] : 0
    const shown: Currency = currency === 'TRY' && latest ? 'TRY' : 'USD'
    setCurrency(shown)
    const rate = (date?: string) => (shown === 'USD' ? 1 : (date && state.fx[date]) || latest)
    const conv = (r: DailyRow) => (shown === 'USD' ? r : { ...r, adRevenue: r.adRevenueTry ?? r.adRevenue * rate(r.date), iapRevenue: r.iapRevenue * rate(r.date) })
    const k = rate()
    return {
      ...state,
      currency: shown,
      allGames: state.games,
      games: state.games.filter((g) => !g.hidden),
      daily: state.daily.filter((r) => keep(r.gameId)).map(conv),
      today: state.today.filter((r) => keep(r.gameId)).map(conv),
      countries: shown === 'USD' ? state.countries : state.countries.map((c) => ({ ...c, revenue: c.try?.revenue ?? c.revenue * k, ecpm: c.try?.ecpm ?? c.ecpm * k, ecpmPrev: c.try?.ecpmPrev ?? c.ecpmPrev * k })),
      adUnits: state.adUnits.filter((u) => keep(u.gameId)).map((u) => (shown === 'USD' ? u : { ...u, revenue: u.try?.revenue ?? u.revenue * k, ecpm: u.try?.ecpm ?? u.ecpm * k, ecpmPrev: u.try?.ecpmPrev ?? u.ecpmPrev * k })),
      alerts: state.alerts.filter((a) => keep(a.gameId)),
      reviews: state.reviews.filter((r) => keep(r.gameId)),
      builds: state.builds.filter((b) => keep(b.gameId)),
      recs: state.recs.filter((r) => keep(r.gameId)),
      // Claude bütçeyi USD yazar; ekranda seçili para birimine çevrilir
      adPlans: state.adPlans.filter((p) => keep(p.gameId)).map((p) => (k === 1 ? p : { ...p, budget: { ...p.budget, daily: p.budget.daily * k } })),
    }
  }, [state, currency])

  useEffect(() => setGames(view.allGames), [view.allGames])

  const setGameHidden = async (id: string, hidden: boolean) => {
    setState((s) => ({ ...s, games: s.games.map((g) => (g.id === id ? { ...g, hidden } : g)) }))
    if (isDemo) return
    const { error } = await supabase!.from('games').update({ hidden }).eq('id', id)
    if (error) {
      setState((s) => ({ ...s, games: s.games.map((g) => (g.id === id ? { ...g, hidden: !hidden } : g)) }))
      throw new Error(error.message)
    }
  }

  return (
    <DataContext.Provider value={{ ...view, reload: () => setVersion((v) => v + 1), setGameHidden, setCurrencyPref }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)

// Kişi adları: e-posta → "Umut", 'assistant' → "Asistan"
export function usePeople() {
  const { people } = useData()
  const { email } = useAuth()
  const myEmail = isDemo ? DEMO_ME : email ?? ''
  const nameOf = (e: string | null | undefined) => {
    if (!e) return '—'
    if (e === 'assistant') return 'Asistan'
    return people.find((p) => p.email.toLowerCase() === e.toLowerCase())?.name ?? e.split('@')[0]
  }
  const me: Person = people.find((p) => p.email.toLowerCase() === myEmail.toLowerCase()) ?? { email: myEmail, name: myEmail.split('@')[0] || 'Sen', role: 'Stüdyo sahibi' }
  const partner = people.find((p) => p.email.toLowerCase() !== myEmail.toLowerCase()) ?? null
  return { people, me, partner, nameOf }
}
