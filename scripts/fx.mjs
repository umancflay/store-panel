// Günlük dolar/TL kurunu (Avrupa Merkez Bankası, frankfurter.dev) app_settings tablosuna yazar.
// Panel gelirleri USD saklar, ekranda her günün kendi kuruyla TL'ye çevirir (AdMob da öyle yapar).
// Anahtar gerekmez.

import { upsert } from './db.mjs'

export async function collectFx() {
  const from = new Date(Date.now() - 75 * 86400000).toISOString().slice(0, 10)
  const res = await fetch(`https://api.frankfurter.dev/v1/${from}..?from=USD&to=TRY`)
  if (!res.ok) throw new Error(`Kur alınamadı: ${res.status}`)
  const { rates } = await res.json()

  // Hafta sonu ve tatillerde kur yayınlanmaz: önceki günün kurunu kullan
  const out = {}
  let last = null
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10)
    last = rates[day]?.TRY ?? last
    if (last) out[day] = last
  }
  await upsert('app_settings', [{ key: 'fx_usd_try', value: out, updated_at: new Date().toISOString() }], 'key')
  console.log(`Kur: ${Object.keys(out).length} gün, son 1 USD = ${last} TL`)
}
