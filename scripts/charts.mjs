// Şu an popüler oyunlar: App Store'un resmi listeleri (ABD ve Türkiye; en çok indirilen ücretsiz + en çok kazanan).
// Google Play herkese açık bir liste vermediği için sadece App Store; trend iki mağazada da genelde aynıdır.
// Ayrıca takip edilen kelimeler için App Store'un arama önerileri ("oyuncular şunu da yazıyor").
// Kayıt: app_settings.top_charts. Sadece okur, para harcamaz.

import { db } from './db.mjs'

const COUNTRIES = { us: 143441, tr: 143480 }
const CHARTS = { free: 'topfreeapplications', grossing: 'topgrossingapplications' }
const LIMIT = 50

async function setting(key) {
  try {
    return (await db(`app_settings?select=value&key=eq.${key}`))[0]?.value ?? null
  } catch {
    return null
  }
}

// iTunes RSS cevabı → sıralı oyun listesi
export function parseFeed(json) {
  return (json?.feed?.entry ?? []).map((e) => ({
    id: e.id?.attributes?.['im:id'],
    name: e['im:name']?.label ?? '',
    artist: e['im:artist']?.label ?? '',
    icon: (e['im:image'] ?? []).at(-1)?.label ?? null,
  })).filter((x) => x.id)
}

// Dünkü listeye göre değişim: prev = önceki sıra (yoksa null = listeye yeni girdi)
export function withChange(list, prevList = []) {
  const before = new Map(prevList.map((x, i) => [x.id, i + 1]))
  return list.map((x) => ({ ...x, prev: prevList.length ? before.get(x.id) ?? null : undefined }))
}

// Listede en çok görülen türler ("Games" ana türü sayılmaz)
export function genreShare(items) {
  const m = new Map()
  for (const x of items) for (const g of x.genres ?? []) if (g !== 'Games') m.set(g, (m.get(g) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8)
}

// App Store arama önerileri (plist) → terimler
export function parseHints(xml) {
  return [...String(xml).matchAll(/<key>term<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1].replace(/&amp;/g, '&'))
}

export async function chartsDue() {
  const cur = await setting('top_charts')
  return !cur?.updated || Date.now() - Date.parse(cur.updated) > 20 * 3600000
}

export async function runCharts() {
  const prev = (await setting('top_charts')) ?? {}
  const countries = {}
  for (const [cc] of Object.entries(COUNTRIES)) {
    const out = {}
    for (const [k, feed] of Object.entries(CHARTS)) {
      const res = await fetch(`https://itunes.apple.com/${cc}/rss/${feed}/limit=${LIMIT}/genre=6014/json`)
      const list = res.ok ? parseFeed(await res.json()) : []
      out[k] = list.length ? list : prev.countries?.[cc]?.[k] ?? []
    }
    // Tür, puan: tek seferde toplu sorgu
    const ids = [...new Set([...out.free, ...out.grossing].map((x) => x.id))]
    const info = new Map()
    for (let i = 0; i < ids.length; i += 100) {
      const r = await fetch(`https://itunes.apple.com/lookup?id=${ids.slice(i, i + 100).join(',')}&country=${cc}`).then((x) => x.json()).catch(() => null)
      for (const a of r?.results ?? []) info.set(String(a.trackId), { genres: a.genres ?? [], rating: a.averageUserRating ?? null, ratings: a.userRatingCount ?? null })
    }
    const enrich = (l) => l.map((x) => ({ ...x, ...(info.get(String(x.id)) ?? {}) }))
    const free = withChange(enrich(out.free), prev.countries?.[cc]?.free)
    const grossing = withChange(enrich(out.grossing), prev.countries?.[cc]?.grossing)
    countries[cc] = { free, grossing, genres: genreShare(free) }
  }

  // Takip edilen kelimeler için arama önerileri (ABD mağazası)
  const watch = (await setting('rank_watch'))?.items ?? {}
  const words = [...new Set(Object.values(watch).flatMap((w) => w.keywords ?? []))].slice(0, 25)
  const hints = {}
  for (const w of words) {
    const xml = await fetch(`https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(w)}`, { headers: { 'X-Apple-Store-Front': `${COUNTRIES.us}-1,29` } }).then((r) => r.text()).catch(() => '')
    hints[w] = parseHints(xml).filter((t) => t !== w).slice(0, 6)
  }

  await db('app_settings?on_conflict=key', 'POST', { key: 'top_charts', value: { updated: new Date().toISOString(), countries, hints }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
  console.log(`Popüler oyunlar: ${Object.keys(countries).length} ülke, ${words.length} kelime önerisi`)
}
