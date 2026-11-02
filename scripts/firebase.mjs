// Firebase (Google Analytics 4): oyunlarda Firebase Analytics varsa günlük yeni ve aktif oyuncu ile "şu an oynayan" sayısı.
// Play indirme raporu 2-5 gün geriden gelir; Analytics aynı gün, canlı sayı ise son 30 dakikayı verir.
// Giriş: Play'in servis hesabı (GOOGLE_PLAY_SA_JSON). Servis hesabının e-postası her Analytics mülküne "Görüntüleyen" olarak eklenmeli.
// Mülkler kendiliğinden bulunur; Android paket adı ya da ad benzerliğiyle paneldeki oyuna bağlanır.

import { db, upsert, setConnection } from './db.mjs'
import { saToken } from './play.mjs'
import { normalize } from './games.mjs'

const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta'
const DATA = 'https://analyticsdata.googleapis.com/v1beta'

export const firebaseReady = Boolean(process.env.GOOGLE_PLAY_SA_JSON)

async function call(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await saToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${json.error?.message ?? ''}`.trim())
  return json
}

// Mülkün veri akışlarından oyunu bul: Android paket adı, yoksa mülk/akış adı benzerliği
export function matchGame(property, streams, games) {
  for (const s of streams) {
    const pkg = s.androidAppStreamData?.packageName
    const g = pkg && games.find((x) => x.android_package === pkg)
    if (g) return g.id
  }
  const names = [property.displayName, ...streams.map((s) => s.displayName)].filter(Boolean).map(normalize)
  const g = games.find((x) => names.some((n) => n && (n === normalize(x.name) || n.startsWith(normalize(x.name)) || normalize(x.name).startsWith(n))))
  return g?.id ?? null
}

// runReport cevabı → [{date, platform, new_users, active_users}]
export function parseDaily(report) {
  const out = new Map()
  for (const r of report.rows ?? []) {
    const [d, p] = r.dimensionValues.map((x) => x.value)
    const platform = /ios/i.test(p) ? 'ios' : /android/i.test(p) ? 'android' : null
    if (!platform || !/^\d{8}$/.test(d)) continue
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    const k = `${date}|${platform}`
    const e = out.get(k) ?? { date, platform, new_users: 0, active_users: 0 }
    e.new_users += Number(r.metricValues[0]?.value ?? 0)
    e.active_users += Number(r.metricValues[1]?.value ?? 0)
    out.set(k, e)
  }
  return [...out.values()]
}

export async function collectFirebase() {
  const { accountSummaries = [] } = await call(`${ADMIN}/accountSummaries?pageSize=200`)
  const props = accountSummaries.flatMap((a) => a.propertySummaries ?? [])
  if (!props.length) {
    const email = JSON.parse(process.env.GOOGLE_PLAY_SA_JSON).client_email
    await setConnection('firebase', 'disconnected', `Analytics mülkü görünmüyor: ${email} adresini Firebase › Proje ayarları › Kullanıcılar ve izinler'e "Görüntüleyen" olarak ekle`)
    return
  }
  const games = await db('games?select=id,name,android_package')
  const live = {}
  const notes = []
  let rows = 0
  for (const p of props) {
    const id = p.property.split('/')[1]
    try {
      const { dataStreams = [] } = await call(`${ADMIN}/${p.property}/dataStreams`)
      const gameId = matchGame(p, dataStreams, games)
      if (!gameId) {
        notes.push(`${p.displayName}: oyun eşleşmedi`)
        continue
      }
      const report = await call(`${DATA}/properties/${id}:runReport`, {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }, { name: 'platform' }],
        metrics: [{ name: 'newUsers' }, { name: 'activeUsers' }],
      })
      const daily = parseDaily(report).map((r) => ({ ...r, game_id: gameId, country: 'ALL' }))
      if (daily.length) await upsert('store_daily', daily, 'date,game_id,platform,country')
      rows += daily.length
      const rt = await call(`${DATA}/properties/${id}:runRealtimeReport`, { metrics: [{ name: 'activeUsers' }] })
      live[gameId] = (live[gameId] ?? 0) + Number(rt.rows?.[0]?.metricValues?.[0]?.value ?? 0)
    } catch (e) {
      notes.push(`${p.displayName}: ${String(e.message).slice(0, 100)}`)
    }
  }
  await upsert('app_settings', [{ key: 'live_players', value: { at: new Date().toISOString(), items: live }, updated_at: new Date().toISOString() }], 'key')
  await setConnection('firebase', 'connected', `${props.length} mülk · ${rows} gün yazıldı · şu an ${Object.values(live).reduce((a, b) => a + b, 0)} oyuncu${notes.length ? ' · ' + notes.join(' · ') : ''}`)
  console.log(`Firebase: ${rows} satır, canlı ${JSON.stringify(live)}`)
}
