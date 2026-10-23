import { daily, isoDay, type DailyRow } from '../data/sample'

export type Range = 1 | 7 | 30
export const rangeLabels: Record<Range, string> = { 1: 'Dün', 7: '7 gün', 30: '30 gün' }

// Seçilen aralık ve bir önceki eşit uzunluktaki dönem
export function periodRows(range: Range, filter?: (r: DailyRow) => boolean) {
  const start = isoDay(range)
  const prevStart = isoDay(range * 2)
  const rows = filter ? daily.filter(filter) : daily
  return {
    cur: rows.filter((r) => r.date >= start),
    prev: rows.filter((r) => r.date >= prevStart && r.date < start),
  }
}

export function totals(rows: DailyRow[]) {
  const t = rows.reduce(
    (a, r) => {
      a.adRevenue += r.adRevenue
      a.iapRevenue += r.iapRevenue
      a.downloads += r.downloads
      a.impressions += r.impressions
      a.requests += r.requests
      a.matched += r.matched
      a.crash += r.crashRate
      a.anr += r.anrRate
      a.rating += r.rating
      a.n++
      if (r.platform === 'android') a.nAndroid++
      return a
    },
    { adRevenue: 0, iapRevenue: 0, downloads: 0, impressions: 0, requests: 0, matched: 0, crash: 0, anr: 0, rating: 0, n: 0, nAndroid: 0 },
  )
  return {
    ...t,
    revenue: t.adRevenue + t.iapRevenue,
    ecpm: t.impressions ? (t.adRevenue / t.impressions) * 1000 : 0,
    fillRate: t.requests ? (t.matched / t.requests) * 100 : 0,
    crashRate: t.n ? t.crash / t.n : 0,
    anrRate: t.nAndroid ? t.anr / t.nAndroid : 0,
    rating: t.n ? t.rating / t.n : 0,
  }
}

// Gün bazında toplam (grafikler için)
export function byDay(rows: DailyRow[]) {
  const map = new Map<string, DailyRow[]>()
  for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), r])
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rs]) => {
      const t = totals(rs)
      return {
        date,
        ad: +t.adRevenue.toFixed(2),
        iap: +t.iapRevenue.toFixed(2),
        downloads: t.downloads,
        ecpm: +t.ecpm.toFixed(2),
        crash: +t.crashRate.toFixed(2),
        anr: +t.anrRate.toFixed(2),
      }
    })
}

// Eşikler: bunları aşan değerler tablolarda kırmızı görünür
export const limits = { crash: 1.09, anr: 0.47, rating: 4.0 }
