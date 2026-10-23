import { isoDay, type DailyRow } from '../data/sample'

export type Range = 1 | 7 | 30
export const rangeLabels: Record<Range, string> = { 1: 'Dün', 7: '7 gün', 30: '30 gün' }

// Seçilen aralık ve bir önceki eşit uzunluktaki dönem
export function periodRows(all: DailyRow[], range: number, filter?: (r: DailyRow) => boolean) {
  const start = isoDay(range)
  const prevStart = isoDay(range * 2)
  const rows = filter ? all.filter(filter) : all
  return {
    cur: rows.filter((r) => r.date >= start),
    prev: rows.filter((r) => r.date >= prevStart && r.date < start),
  }
}

// Ortalama; hiç değer yoksa null (panelde "—")
function avg(list: (number | null)[]) {
  const v = list.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

// Puan zaten mağazanın toplam ortalaması: her oyun/platform için en son değeri al, onların ortalamasını göster
function latestRating(rows: DailyRow[]) {
  const latest = new Map<string, DailyRow>()
  for (const r of rows) {
    if (r.rating == null) continue
    const k = r.gameId + r.platform
    if (!latest.has(k) || latest.get(k)!.date < r.date) latest.set(k, r)
  }
  return avg([...latest.values()].map((r) => r.rating))
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
      return a
    },
    { adRevenue: 0, iapRevenue: 0, downloads: 0, impressions: 0, requests: 0, matched: 0 },
  )
  return {
    ...t,
    revenue: t.adRevenue + t.iapRevenue,
    ecpm: t.impressions ? (t.adRevenue / t.impressions) * 1000 : 0,
    fillRate: t.requests ? (t.matched / t.requests) * 100 : 0,
    crashRate: avg(rows.map((r) => r.crashRate)),
    anrRate: avg(rows.filter((r) => r.platform === 'android').map((r) => r.anrRate)),
    rating: latestRating(rows),
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
        impressions: t.impressions,
        ecpm: +t.ecpm.toFixed(2),
        crash: t.crashRate == null ? null : +t.crashRate.toFixed(2),
        anr: t.anrRate == null ? null : +t.anrRate.toFixed(2),
      }
    })
}

// Eşikler: bunları aşan değerler tablolarda kırmızı görünür
export const limits = { crash: 1.09, anr: 0.47, rating: 4.0 }
