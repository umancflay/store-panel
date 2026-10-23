// App Store Connect verilerini çeker:
//   - Günlük indirme ve uygulama içi satın alma (Sales and Trends raporu; ASC_VENDOR_NUMBER girildiyse)
//   - Son yorumlar, son sürüm ve inceleme durumu, son build
//   - Ortalama puan (Apple'ın herkese açık iTunes arama servisi)
// Giriş: App Store Connect API anahtarı (ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY).

import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { db, upsert, setConnection } from './db.mjs'
import { gameLinker } from './games.mjs'

export const appStoreReady = Boolean(process.env.ASC_ISSUER_ID && process.env.ASC_KEY_ID && process.env.ASC_PRIVATE_KEY)

const API = 'https://api.appstoreconnect.apple.com/v1'

function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const head = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.ASC_KEY_ID.trim(), typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ iss: process.env.ASC_ISSUER_ID.trim(), iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url')
  // GitHub Secrets'a .p8 dosyasının tamamı yapıştırılır; tek satıra dönüşmüşse düzelt
  const key = process.env.ASC_PRIVATE_KEY.trim().replace(/\\n/g, '\n')
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${head}.${body}.${sig}`
}

async function api(path, { raw = false, allow404 = false } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    headers: { Authorization: `Bearer ${jwt()}`, Accept: raw ? 'application/a-gzip' : 'application/json' },
  })
  if (allow404 && res.status === 404) return null
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json()
}

const stateLabel = {
  READY_FOR_SALE: 'Yayında', READY_FOR_DISTRIBUTION: 'Yayında', WAITING_FOR_REVIEW: 'İncelemeyi bekliyor', IN_REVIEW: 'İncelemede',
  REJECTED: 'Reddedildi', METADATA_REJECTED: 'Reddedildi (bilgiler)', DEVELOPER_REJECTED: 'Geliştirici geri çekti',
  PREPARE_FOR_SUBMISSION: 'Hazırlanıyor', PENDING_DEVELOPER_RELEASE: 'Yayın onayı bekliyor', PROCESSING_FOR_APP_STORE: 'İşleniyor',
  PENDING_APPLE_RELEASE: 'Apple yayınlayacak', INVALID_BINARY: 'Geçersiz build',
}

async function rating(appId) {
  for (const country of ['tr', 'us']) {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${appId}&country=${country}`).then((x) => x.json()).catch(() => null)
    const v = r?.results?.[0]?.averageUserRating
    if (v) return v
  }
  return null
}

// Para birimlerini USD'ye çevirmek için bedava kur servisi
async function usdRates() {
  const r = await fetch('https://api.frankfurter.app/latest?from=USD').then((x) => x.json()).catch(() => null)
  return { USD: 1, ...(r?.rates ?? {}) }
}

const ymd = (d) => d.toISOString().slice(0, 10)

async function sales(appsBySku, appsById, link, days) {
  const vendor = process.env.ASC_VENDOR_NUMBER?.trim()
  if (!vendor) return 0
  const rates = await usdRates()
  const rows = new Map()
  for (let i = days; i >= 1; i--) {
    const date = ymd(new Date(Date.now() - i * 86400000))
    const gz = await api(
      `/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${vendor}&filter[reportDate]=${date}&filter[version]=1_1`,
      { raw: true, allow404: true },
    )
    if (!gz) continue // o gün satış/indirme yok ya da rapor henüz hazır değil
    const [head, ...lines] = zlib.gunzipSync(gz).toString('utf8').trim().split('\n')
    const cols = head.split('\t')
    const at = (l, c) => l[cols.indexOf(c)]
    for (const line of lines) {
      const l = line.split('\t')
      const type = at(l, 'Product Type Identifier')
      const units = Number(at(l, 'Units')) || 0
      const isDownload = ['1', '1F', '1T', 'F1'].includes(type)
      const isIap = /^(IA|FI)/.test(type)
      if (!isDownload && !isIap) continue
      const app = isDownload ? appsById.get(at(l, 'Apple Identifier')) : appsBySku.get(at(l, 'Parent Identifier'))
      if (!app) continue
      const gameId = await link({ name: app.attributes.name, platform: 'ios', iosAppId: app.id })
      const key = `${date}|${gameId}`
      const e = rows.get(key) ?? { date, game_id: gameId, platform: 'ios', country: 'ALL', downloads: 0, iap_revenue: 0 }
      if (isDownload) e.downloads += units
      else {
        const cur = at(l, 'Currency of Proceeds')
        e.iap_revenue = +(e.iap_revenue + (units * Number(at(l, 'Developer Proceeds'))) / (rates[cur] ?? 1)).toFixed(2)
      }
      rows.set(key, e)
    }
  }
  if (rows.size) await upsert('store_daily', [...rows.values()], 'date,game_id,platform,country')
  return rows.size
}

// light = true: sadece sürüm/inceleme durumu ve yorumlar (6 saatlik kontrol için)
export async function collectAppStore({ light = false } = {}) {
  const { data: apps = [] } = await api('/apps?limit=200&fields[apps]=name,bundleId,sku')
  if (!apps.length) throw new Error('API anahtarı hiçbir uygulamayı göremiyor.')

  const link = await gameLinker()
  const notes = []
  for (const app of apps) {
    const name = app.attributes.name
    const gameId = await link({ name, platform: 'ios', iosAppId: app.id })
    const safe = async (label, fn) => {
      try {
        await fn()
      } catch (e) {
        notes.push(`${name} ${label}: ${String(e.message).slice(0, 120)}`)
      }
    }

    await safe('yorumlar', async () => {
      const { data = [] } = await api(`/apps/${app.id}/customerReviews?sort=-createdDate&limit=50`)
      const rows = data.map((r) => ({
        store_review_id: `ios:${r.id}`,
        game_id: gameId,
        platform: 'ios',
        author: r.attributes.reviewerNickname ?? 'Anonim',
        rating: r.attributes.rating,
        title: r.attributes.title ?? null,
        body: r.attributes.body ?? '',
        country: r.attributes.territory ?? null,
        created_at: r.attributes.createdDate,
      }))
      if (rows.length) await upsert('reviews', rows, 'store_review_id')
    })

    await safe('sürüm', async () => {
      const [{ data: versions = [] }, { data: builds = [] }] = await Promise.all([
        api(`/apps/${app.id}/appStoreVersions?limit=5`),
        api(`/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=1`),
      ])
      const v = versions.sort((a, b) => (b.attributes.createdDate ?? '').localeCompare(a.attributes.createdDate ?? ''))[0]
      if (!v) return
      const state = v.attributes.appVersionState ?? v.attributes.appStoreState
      await upsert('builds', [{
        game_id: gameId,
        platform: 'ios',
        version: v.attributes.versionString,
        build_number: builds[0]?.attributes?.version ?? '',
        status: stateLabel[state] ?? state,
        review_status: state,
        updated_at: new Date().toISOString(),
      }], 'game_id,platform,version,build_number')

      // Reddedilen sürüm için uyarı (aynı sürüm için bir kez)
      if (['REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(state)) {
        await upsert('alerts', [{
          external_id: `asc-rejected-${v.id}`,
          level: 'critical',
          source: 'app_store',
          game_id: gameId,
          title: `${name} ${v.attributes.versionString} reddedildi`,
          body: 'App Store incelemesi bu sürümü reddetti. Sebebi App Store Connect › App Review bölümündeki mesajda yazıyor.',
          how_to_fix: [
            'App Store Connect › Uygulamalar › ' + name + ' › App Review bölümüne gir ve Apple\'ın mesajını oku.',
            'Mesajdaki guideline numarasına göre sorunu düzelt.',
            'Kod değiştiyse yeni build yükle; sadece bilgiler (metadata) sorunluysa yeni build gerekmez.',
            'Resolution Center\'dan ne değiştirdiğini kısaca yazıp yeniden incelemeye gönder.',
          ].join('\n'),
          console_url: `https://appstoreconnect.apple.com/apps/${app.id}/distribution`,
        }], 'external_id')
      }
    })
    if (light) continue

    await safe('puan', async () => {
      const r = await rating(app.id)
      if (r) await upsert('store_daily', [{ date: ymd(new Date(Date.now() - 86400000)), game_id: gameId, platform: 'ios', country: 'ALL', rating: r }], 'date,game_id,platform,country')
    })
  }

  if (!light) {
    try {
      const existing = await db('store_daily?platform=eq.ios&downloads=gt.0&select=date&limit=1')
      const appsBySku = new Map(apps.map((a) => [a.attributes.sku, a]))
      const appsById = new Map(apps.map((a) => [a.id, a]))
      await sales(appsBySku, appsById, link, existing.length ? 4 : 30)
    } catch (e) {
      notes.push(`satış raporu: ${String(e.message).slice(0, 150)}`)
    }
  }

  const msg = `${apps.length} uygulama${process.env.ASC_VENDOR_NUMBER ? '' : ' · indirme için ASC_VENDOR_NUMBER girilmemiş'}${notes.length ? ' · ' + notes.join(' · ') : ''}`
  await setConnection('app_store', 'connected', msg.slice(0, 500))
  console.log('App Store:', msg)
}
