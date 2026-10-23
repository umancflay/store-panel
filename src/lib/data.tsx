import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  isoDay, sampleAdUnits, sampleCountries, sampleDaily, sampleGames, setGames,
  type AdUnit, type Country, type DailyRow, type Game, type Platform,
} from '../data/sample'
import { supabase } from './supabase'

// Panelin veri kaynağı. Bir kaynak bağlıysa (connections tablosunda "connected")
// o kaynağın verisi Supabase'den gelir; bağlı değilse örnek veri gösterilir.
//   live.admob → gelir, eCPM, gösterim, fill rate gerçek
//   live.store → indirme, puan, çökme, IAP gerçek (3. aşama)

export interface Connection {
  source: string
  status: string
  last_sync_at: string | null
  message: string | null
}

interface DataState {
  loading: boolean
  games: Game[]
  daily: DailyRow[]
  adUnits: AdUnit[]
  countries: Country[]
  live: { admob: boolean; store: boolean }
  // Gelir gerçek ama mağaza verisi henüz yok: indirme/puan/çökme "—" gösterilir
  storeMissing: boolean
  connections: Connection[]
  lastRun: { job: string; status: string; finished_at: string | null; message: string | null } | null
}

const sample: DataState = {
  loading: false,
  games: sampleGames,
  daily: sampleDaily,
  adUnits: sampleAdUnits,
  countries: sampleCountries,
  live: { admob: false, store: false },
  storeMissing: false,
  connections: [],
  lastRun: null,
}

const DataContext = createContext<DataState>(sample)

const colors = ['#0075ff', '#01b574', '#a855f7', '#ffa53d', '#2cd9ff', '#ff4d5e', '#f472b6']

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

const num = (v: unknown) => Number(v ?? 0)

async function loadLive(): Promise<DataState> {
  const db = supabase!
  const [conns, gamesRes, runs] = await Promise.all([
    db.from('connections').select('source,status,last_sync_at,message'),
    db.from('games').select('id,name,genre,platforms').eq('active', true).order('created_at'),
    db.from('sync_runs').select('job,status,finished_at,message').order('started_at', { ascending: false }).limit(1),
  ])
  const connections = (conns.data ?? []) as Connection[]
  const lastRun = runs.data?.[0] ?? null
  const admobLive = connections.some((c) => c.source === 'admob' && c.status === 'connected')

  if (!admobLive) return { ...sample, connections, lastRun }

  const games: Game[] = (gamesRes.data ?? []).map((g, i) => ({
    id: g.id,
    name: g.name,
    genre: g.genre ?? '',
    platforms: (g.platforms ?? []) as Platform[],
    color: sampleGames.find((s) => s.id === g.id)?.color ?? colors[i % colors.length],
  }))

  // Bugünün verisi yarım olduğu için dahil edilmez
  const today = isoDay(0)
  const cur = { from: isoDay(30), to: isoDay(1) }
  const prev = { from: isoDay(60), to: isoDay(31) }
  const [byDay, cNow, cPrev, uNow, uPrev] = await Promise.all([
    db.rpc('admob_by_day', { p_from: isoDay(60) }),
    db.rpc('admob_by_country', { p_from: cur.from, p_to: cur.to }),
    db.rpc('admob_by_country', { p_from: prev.from, p_to: prev.to }),
    db.rpc('admob_by_unit', { p_from: cur.from, p_to: cur.to }),
    db.rpc('admob_by_unit', { p_from: prev.from, p_to: prev.to }),
  ])
  const err = [byDay, cNow, cPrev, uNow, uPrev].find((r) => r.error)?.error
  if (err) throw err

  const daily: DailyRow[] = (byDay.data ?? [])
    .filter((r: { date: string }) => r.date < today)
    .map((r: Record<string, unknown>) => ({
      date: r.date as string,
      gameId: r.game_id as string,
      platform: r.platform as Platform,
      adRevenue: num(r.revenue),
      impressions: num(r.impressions),
      requests: num(r.requests),
      matched: num(r.matched),
      // Mağaza verileri 3. aşamada gelecek
      downloads: 0,
      iapRevenue: 0,
      crashRate: 0,
      anrRate: 0,
      rating: 0,
    }))

  const ecpm = (rev: number, imp: number) => (imp ? (rev / imp) * 1000 : 0)
  const prevCountry = new Map((cPrev.data ?? []).map((c: Record<string, unknown>) => [c.country, c]))
  const countries: Country[] = (cNow.data ?? []).map((c: Record<string, unknown>) => {
    const p = prevCountry.get(c.country) as Record<string, unknown> | undefined
    return {
      code: c.country as string,
      name: countryName(c.country as string),
      revenue: num(c.revenue),
      impressions: num(c.impressions),
      ecpm: ecpm(num(c.revenue), num(c.impressions)),
      ecpmPrev: p ? ecpm(num(p.revenue), num(p.impressions)) : 0,
    }
  })

  const prevUnit = new Map((uPrev.data ?? []).map((u: Record<string, unknown>) => [u.ad_unit_id, u]))
  const fill = (m: number, r: number) => (r ? (m / r) * 100 : 0)
  const adUnits: AdUnit[] = (uNow.data ?? []).map((u: Record<string, unknown>) => {
    const p = prevUnit.get(u.ad_unit_id) as Record<string, unknown> | undefined
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

  return { loading: false, games, daily, adUnits, countries, live: { admob: true, store: false }, storeMissing: true, connections, lastRun }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>(supabase ? { ...sample, loading: true } : sample)

  useEffect(() => {
    if (!supabase) return
    loadLive()
      .then((s) => {
        setGames(s.games)
        setState(s)
      })
      .catch((e) => {
        console.error('Veri yüklenemedi', e)
        setState(sample)
      })
  }, [])

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
