// Rakip ve anahtar kelime takibi. Herkese açık mağaza sayfalarını okur; hiçbir şeyi değiştirmez, para harcamaz.
//   - Anahtar kelime sırası: Play araması (ilk ~30 sonuç) ve App Store araması (iTunes Search API, ilk 200 sonuç)
//   - Rakipler: Play sayfasındaki puan, yorum sayısı, indirme ve son güncelleme tarihi
// Neyin takip edileceği panelden seçilir: app_settings.rank_watch › items[oyun] = { keywords, rivals, country }
// Geçmiş: app_settings.rank_history › items[oyun] (her kelime ve rakip için son 60 gün).
// Kayda değer değişiklikte (ilk 10'a girme/çıkma, rakip güncellemesi) telefona bildirim gider.

import { db } from './db.mjs'
import { parseSearch } from './expert/aso.mjs'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en-US,en;q=0.9' }
const KEEP = 60
const today = () => new Date().toISOString().slice(0, 10)

async function setting(key) {
  try {
    return (await db(`app_settings?select=value&key=eq.${key}`))[0]?.value ?? null
  } catch {
    return null
  }
}
const save = (key, value) => db('app_settings?on_conflict=key', 'POST', { key, value, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')

// "https://play.google.com/store/apps/details?id=com.x.y" ya da düz paket adı → paket adı
export function pkgOf(s) {
  const t = String(s ?? '').trim()
  return t.match(/[?&]id=([A-Za-z0-9._]+)/)?.[1] ?? (/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(t) ? t : null)
}

// Play arama sayfasında oyunun sırası (bulunamazsa null = ilk ~30'da yok)
export function playRank(html, pkg) {
  const i = parseSearch(html).indexOf(pkg)
  return i < 0 ? null : i + 1
}

// iTunes Search API cevabında oyunun sırası
export function iosRank(json, appId) {
  const i = (json?.results ?? []).findIndex((r) => String(r.trackId) === String(appId))
  return i < 0 ? null : i + 1
}

// Rakibin herkese açık Play sayfası
export function parseRival(html) {
  const title = (html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? '').replace(/ - Apps on Google Play$/, '').replace(/&amp;/g, '&').replace(/&#39;/g, '’')
  const icon = html.match(/<img src="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)=[^"]*"[^>]*alt="Icon image"/)?.[1] ?? null
  const rating = Number(html.match(/aria-label="Rated ([\d.]+) stars/)?.[1] ?? NaN)
  const reviews = html.match(/([\d.,]+[KMB]?) reviews/)?.[1] ?? null
  const inst = html.match(/\["([\d,]+\+)",(\d+),(\d+),"([^"]+)"\]/)
  const upd = html.match(/Updated on<\/div><div[^>]*>([^<]+)</)?.[1]
  const updMs = upd ? Date.parse(upd) : NaN
  return {
    title,
    icon,
    rating: Number.isFinite(rating) ? rating : null,
    reviews,
    installs: inst ? Number(inst[3]) : null,
    installsLabel: inst?.[4] ?? null,
    updated: Number.isFinite(updMs) ? new Date(updMs + 12 * 3600000).toISOString().slice(0, 10) : null,
  }
}

// Günlük kaydı listeye ekle: aynı gün varsa üzerine yazar, en fazla KEEP gün tutar
export function pushSnap(list = [], snap, keep = KEEP) {
  return [...list.filter((x) => x.d !== snap.d), snap].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-keep)
}

// Bildirime değer değişiklikler: ilk 10'a girme/çıkma, rakibin yeni güncellemesi
export function changes(gameName, prev = {}, next = {}) {
  const out = []
  for (const [kw, h] of Object.entries(next.keywords ?? {})) {
    const before = (prev.keywords?.[kw]?.snaps ?? []).at(-1)
    const now = h.snaps.at(-1)
    if (!before || !now) continue
    for (const store of ['play', 'ios']) {
      const a = before[store]
      const b = now[store]
      const label = store === 'play' ? 'Play' : 'App Store'
      if (b != null && b <= 10 && (a == null || a > 10)) out.push(`${gameName}: "${kw}" ${label}'de ilk 10'a girdi (${b}.)`)
      if (a != null && a <= 10 && (b == null || b > 10)) out.push(`${gameName}: "${kw}" ${label}'de ilk 10'dan çıktı (${b ?? '30+'}.)`)
    }
  }
  for (const [pkg, r] of Object.entries(next.rivals ?? {})) {
    const before = prev.rivals?.[pkg]
    if (before?.updated && r.updated && r.updated > before.updated) out.push(`Rakip güncelledi: ${r.title || pkg} (${gameName} rakibi)`)
  }
  return out
}

async function get(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Panelde "Şimdi kontrol et"e basıldıysa ya da son kontrol 20 saatten eskiyse çalışır
export async function ranksDue() {
  const watch = await setting('rank_watch')
  if (!watch || !Object.keys(watch.items ?? {}).length) return false
  if (watch.requested) return true
  const last = (await setting('rank_history'))?.updated
  return !last || Date.now() - Date.parse(last) > 20 * 3600000
}

export async function runRanks() {
  const watch = (await setting('rank_watch')) ?? { items: {} }
  const hist = (await setting('rank_history')) ?? { items: {} }
  const games = await db('games?select=id,name,android_package,ios_app_id&active=eq.true')
  const d = today()
  const notes = []
  let checked = 0
  for (const [gameId, w] of Object.entries(watch.items ?? {})) {
    const game = games.find((g) => g.id === gameId)
    if (!game) continue
    const country = (w.country || 'us').toLowerCase()
    const prev = hist.items?.[gameId] ?? {}
    const next = { keywords: {}, rivals: {} }

    for (const kw of (w.keywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 15)) {
      const snap = { d }
      if (game.android_package) {
        const html = await (await get(`https://play.google.com/store/search?q=${encodeURIComponent(kw)}&c=apps&hl=en&gl=${country.toUpperCase()}`).catch(() => null))?.text().catch(() => null)
        if (html) snap.play = playRank(html, game.android_package)
      }
      if (game.ios_app_id) {
        const json = await (await get(`https://itunes.apple.com/search?term=${encodeURIComponent(kw)}&entity=software&country=${country}&limit=200`).catch(() => null))?.json().catch(() => null)
        if (json) snap.ios = iosRank(json, game.ios_app_id)
      }
      next.keywords[kw] = { snaps: pushSnap(prev.keywords?.[kw]?.snaps, snap) }
      checked++
      await wait(800)
    }

    for (const pkg of (w.rivals ?? []).map(pkgOf).filter(Boolean).slice(0, 10)) {
      const html = await (await get(`https://play.google.com/store/apps/details?id=${pkg}&hl=en&gl=US`).catch(() => null))?.text().catch(() => null)
      const old = prev.rivals?.[pkg]
      if (!html) {
        if (old) next.rivals[pkg] = old
        continue
      }
      const p = parseRival(html)
      next.rivals[pkg] = {
        title: p.title || old?.title || pkg,
        icon: p.icon ?? old?.icon ?? null,
        updated: p.updated ?? old?.updated ?? null,
        snaps: pushSnap(old?.snaps, { d, rating: p.rating, reviews: p.reviews, installs: p.installs, label: p.installsLabel }),
      }
      checked++
      await wait(800)
    }

    notes.push(...changes(game.name, prev, next))
    hist.items = { ...(hist.items ?? {}), [gameId]: next }
  }
  hist.updated = new Date().toISOString()
  await save('rank_history', hist)
  // İş sürerken panelden yapılan değişiklikler kaybolmasın: son hali okuyup sadece bayrağı indir
  if (watch.requested) await save('rank_watch', { ...((await setting('rank_watch')) ?? watch), requested: false })
  for (const body of notes.slice(0, 5)) {
    await db('notify_outbox', 'POST', { title: 'Mağaza takibi', body: body.slice(0, 160), url: './#/rakipler' }, 'return=minimal').catch(() => {})
  }
  console.log(`Mağaza takibi: ${checked} kontrol, ${notes.length} değişiklik`)
}
