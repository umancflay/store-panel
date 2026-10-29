// Panelden istenen koçluk işleri (app_settings.expert_queue): mağaza sayfası incelemesi ve sürüm notu.
// Sonuç app_settings'e yazılır (aso:<oyun>, whatsnew:<oyun>), isteyene telefon bildirimi gider.

import { asoRules, competitors, readListing, suggest, whatsNew } from './aso.mjs'

const LANG = { TR: ['tr', 'Türkçe'], US: ['en', 'İngilizce'], GB: ['en', 'İngilizce'], DE: ['de', 'Almanca'], FR: ['fr', 'Fransızca'], ES: ['es', 'İspanyolca'], MX: ['es', 'İspanyolca'], BR: ['pt', 'Portekizce'], RU: ['ru', 'Rusça'], ID: ['id', 'Endonezce'], JP: ['ja', 'Japonca'], KR: ['ko', 'Korece'], IT: ['it', 'İtalyanca'], IN: ['hi', 'Hintçe'], SA: ['ar', 'Arapça'] }

export const queueOf = async (db) => (await db('app_settings?key=eq.expert_queue&select=value'))[0]?.value?.items ?? []

const save = (db, key, value) =>
  db('app_settings?on_conflict=key', 'POST', [{ key, value, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal')

// Gelirin geldiği ilk 3 ülkenin dilleri (son 30 gün)
async function topCountries(db, gameId) {
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const rows = await db(`admob_daily?game_id=eq.${encodeURIComponent(gameId)}&date=gte.${from}&select=country,revenue&limit=5000`).catch(() => [])
  const sum = new Map()
  for (const r of rows) if (r.country) sum.set(r.country, (sum.get(r.country) ?? 0) + Number(r.revenue ?? 0))
  const seen = new Set()
  return [...sum].sort((a, b) => b[1] - a[1]).map(([c]) => LANG[c]).filter((l) => l && !seen.has(l[0]) && seen.add(l[0])).slice(0, 3).map(([lang, name]) => ({ lang, name }))
}

export async function runAso(item, deps) {
  const { db } = deps
  const [game] = await db(`games?id=eq.${encodeURIComponent(item.gameId)}&select=id,name,genre,android_package`)
  if (!game?.android_package) throw new Error('Bu oyunun Play paket adı panelde yok (Oyunlar › oyun › ayarlar).')
  const { defaultLanguage, listings, images } = await (deps.readListing ?? readListing)(game.android_package)
  const listing = listings.find((l) => l.language === defaultLanguage) ?? listings[0] ?? null
  const query = game.genre || (listing?.title ?? game.name).split(/[:\-–]/)[1]?.trim() || game.name
  const rivals = await (deps.competitors ?? competitors)(query, [game.android_package])
  const findings = asoRules({ listing, images, competitors: rivals, languages: listings.map((l) => l.language), topCountries: await topCountries(db, game.id) })
  const suggestions = await (deps.suggest ?? suggest)({ listing, rivals, language: defaultLanguage })
  return {
    at: new Date().toISOString(), query, language: defaultLanguage, languages: listings.map((l) => l.language),
    listing: listing && { title: listing.title, short: listing.shortDescription, fullLength: (listing.fullDescription ?? '').length, video: listing.video || null },
    images, rivals, findings, suggestions,
  }
}

// Kuyruktaki her işi yapar, kuyruğu boşaltır. Hata olursa sonuç yerine hata yazılır.
export async function runQueue(deps) {
  const { db, notify } = deps
  const items = await queueOf(db)
  if (!items.length) return 0
  await save(db, 'expert_queue', { items: [] }) // panel bu sırada yeni istek eklerse bir sonraki çalışmada alınır
  for (const it of items) {
    const [game] = await db(`games?id=eq.${encodeURIComponent(it.gameId)}&select=name`).catch(() => [])
    const name = game?.name ?? it.gameId
    try {
      if (it.kind === 'aso') {
        await save(db, `aso:${it.gameId}`, await runAso(it, deps))
        await notify(it.by, `${name}: mağaza sayfası raporu hazır`, 'Ne eksik, rakipler ne yapıyor ve başlık/açıklama önerileri Yayın Uzmanı › Mağaza sayfası\'nda.', './#/yayin?tab=aso')
      } else if (it.kind === 'notes') {
        const n = await (deps.whatsNew ?? whatsNew)(it.bullets ?? '')
        await save(db, `whatsnew:${it.gameId}`, { at: new Date().toISOString(), bullets: it.bullets, ...n })
        await notify(it.by, `${name}: sürüm notu hazır`, 'Türkçe ve İngilizce "Yenilikler" metni panelde; kopyalayıp Play\'e yapıştırabilirsin.', './#/yayin?tab=aso')
      }
    } catch (e) {
      console.error(`Koçluk işi (${it.kind}, ${it.gameId}) yapılamadı:`, e.message)
      await save(db, `${it.kind === 'aso' ? 'aso' : 'whatsnew'}:${it.gameId}`, { at: new Date().toISOString(), error: e.message })
    }
  }
  return items.length
}
