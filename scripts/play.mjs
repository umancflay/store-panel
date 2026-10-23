// Google Play verilerini çeker:
//   - Çökme ve ANR oranı (Play Developer Reporting API)
//   - Son yorumlar ve sürüm durumu (Android Publisher API)
//   - Günlük indirme ve puan (Play Console raporları, Cloud Storage; PLAY_REPORTS_BUCKET girildiyse)
// Giriş: Google Cloud servis hesabı (GOOGLE_PLAY_SA_JSON), Play Console'da kullanıcı olarak davet edilmiş olmalı.

import crypto from 'node:crypto'
import { upsert, setConnection } from './db.mjs'
import { gameLinker } from './games.mjs'

export const playReady = Boolean(process.env.GOOGLE_PLAY_SA_JSON)

const REPORTING = 'https://playdeveloperreporting.googleapis.com/v1beta1'
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const b64url = (b) => Buffer.from(b).toString('base64url')

let token = null
async function saToken() {
  if (token) return token
  const sa = JSON.parse(process.env.GOOGLE_PLAY_SA_JSON)
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: [
        'https://www.googleapis.com/auth/androidpublisher',
        'https://www.googleapis.com/auth/playdeveloperreporting',
        'https://www.googleapis.com/auth/devstorage.read_only',
      ].join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), sa.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Play servis hesabı girişi başarısız: ${json.error} ${json.error_description ?? ''}`)
  return (token = json.access_token)
}

async function api(url, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await saToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${url.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  if (raw) return Buffer.from(await res.arrayBuffer())
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const iso = (t) => `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`

// Çökme / ANR: son 30 gün, günlük. Google verisi 1-2 gün geriden gelir.
async function vitals(pkg, metricSet, metric) {
  const info = await api(`${REPORTING}/apps/${pkg}/${metricSet}`)
  const end = info.freshnessInfo?.freshnesses?.find((f) => f.aggregationPeriod === 'DAILY')?.latestEndTime
  if (!end) return []
  const endDate = new Date(Date.UTC(end.year, end.month - 1, end.day))
  const startDate = new Date(endDate.getTime() - 30 * 86400000)
  const t = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), timeZone: { id: 'America/Los_Angeles' } })
  const out = await api(`${REPORTING}/apps/${pkg}/${metricSet}:query`, {
    method: 'POST',
    body: { timelineSpec: { aggregationPeriod: 'DAILY', startTime: t(startDate), endTime: t(endDate) }, metrics: [metric], pageSize: 100 },
  })
  return (out.rows ?? []).map((r) => ({
    date: iso(r.startTime),
    value: Number(r.metrics?.find((m) => m.metric === metric)?.decimalValue?.value ?? NaN) * 100,
  })).filter((r) => !Number.isNaN(r.value))
}

// Play Console CSV raporları UTF-16 olarak gelir
function parseCsv(buf) {
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le').slice(1) : buf.toString('utf8')
  const [head, ...lines] = text.trim().split(/\r?\n/)
  const cols = head.split(',')
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))
}

async function installsAndRatings(pkg) {
  const bucket = process.env.PLAY_REPORTS_BUCKET?.trim().replace(/^gs:\/\//, '').split('/')[0]
  if (!bucket) return []
  const months = [0, 1].map((i) => {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - i)
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
  const byDate = new Map()
  for (const m of months) {
    for (const [kind, file] of [['installs', `stats/installs/installs_${pkg}_${m}_overview.csv`], ['ratings', `stats/ratings/ratings_${pkg}_${m}_overview.csv`]]) {
      let rows
      try {
        rows = parseCsv(await api(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(file)}?alt=media`, { raw: true }))
      } catch {
        continue // o ay için rapor yok
      }
      for (const r of rows) {
        const e = byDate.get(r.Date) ?? { date: r.Date }
        if (kind === 'installs') e.downloads = Number(r['Daily User Installs'] ?? r['Install events'] ?? 0)
        else e.rating = Number(r['Total Average Rating']) || null
        byDate.set(r.Date, e)
      }
    }
  }
  return [...byDate.values()]
}

async function reviews(pkg, gameId) {
  const out = await api(`${PUBLISHER}/${pkg}/reviews?maxResults=100`)
  return (out.reviews ?? []).map((r) => {
    const user = r.comments?.find((c) => c.userComment)?.userComment ?? {}
    const dev = r.comments?.find((c) => c.developerComment)?.developerComment
    return {
      store_review_id: `play:${r.reviewId}`,
      game_id: gameId,
      platform: 'android',
      author: r.authorName || 'Anonim',
      rating: user.starRating ?? null,
      body: (user.text ?? '').trim(),
      language: user.reviewerLanguage ?? null,
      app_version: user.appVersionName ?? null,
      created_at: new Date(Number(user.lastModified?.seconds ?? 0) * 1000).toISOString(),
      store_reply: dev?.text ?? null,
    }
  })
}

const releaseStatus = { completed: 'Yayında', inProgress: 'Kademeli yayın', draft: 'Taslak', halted: 'Durduruldu' }

async function latestRelease(pkg, gameId) {
  const edit = await api(`${PUBLISHER}/${pkg}/edits`, { method: 'POST', body: {} })
  try {
    const { tracks = [] } = await api(`${PUBLISHER}/${pkg}/edits/${edit.id}/tracks`)
    const order = ['production', 'beta', 'alpha', 'internal']
    tracks.sort((a, b) => order.indexOf(a.track) - order.indexOf(b.track))
    for (const t of tracks) {
      const rel = t.releases?.[0]
      if (!rel) continue
      return {
        game_id: gameId,
        platform: 'android',
        version: rel.name ?? String(rel.versionCodes?.[0] ?? '?'),
        build_number: String(rel.versionCodes?.[0] ?? ''),
        status: `${releaseStatus[rel.status] ?? rel.status}${t.track === 'production' ? '' : ` (${t.track})`}`,
        review_status: null,
        updated_at: new Date().toISOString(),
      }
    }
  } finally {
    await api(`${PUBLISHER}/${pkg}/edits/${edit.id}`, { method: 'DELETE' }).catch(() => {})
  }
  return null
}

// light = true: sadece sürüm durumu ve yorumlar (6 saatlik kontrol için)
export async function collectPlay({ light = false } = {}) {
  const { apps = [] } = await api(`${REPORTING}/apps:search?pageSize=100`)
  if (!apps.length) throw new Error('Servis hesabı hiçbir uygulamayı göremiyor. Play Console › Kullanıcılar ve izinler bölümünden davet edildiğinden emin ol.')

  const link = await gameLinker()
  const notes = []
  for (const app of apps) {
    const pkg = app.packageName
    const gameId = await link({ name: app.displayName ?? pkg, platform: 'android', androidPackage: pkg })
    const safe = async (label, fn) => {
      try {
        await fn()
      } catch (e) {
        notes.push(`${app.displayName ?? pkg} ${label}: ${String(e.message).slice(0, 120)}`)
      }
    }
    const key = { game_id: gameId, platform: 'android', country: 'ALL' }

    await safe('yorumlar', async () => {
      const rows = await reviews(pkg, gameId)
      if (rows.length) await upsert('reviews', rows, 'store_review_id')
    })
    await safe('sürüm', async () => {
      const rel = await latestRelease(pkg, gameId)
      if (rel) await upsert('builds', [rel], 'game_id,platform,version,build_number')
    })
    if (light) continue

    await safe('çökme', async () => {
      const rows = await vitals(pkg, 'crashRateMetricSet', 'userPerceivedCrashRate')
      if (rows.length) await upsert('store_daily', rows.map((r) => ({ ...key, date: r.date, crash_rate: r.value })), 'date,game_id,platform,country')
    })
    await safe('ANR', async () => {
      const rows = await vitals(pkg, 'anrRateMetricSet', 'userPerceivedAnrRate')
      if (rows.length) await upsert('store_daily', rows.map((r) => ({ ...key, date: r.date, anr_rate: r.value })), 'date,game_id,platform,country')
    })
    await safe('indirme', async () => {
      const rows = await installsAndRatings(pkg)
      const withD = rows.filter((r) => r.downloads !== undefined)
      if (withD.length) await upsert('store_daily', withD.map((r) => ({ ...key, date: r.date, downloads: r.downloads, rating: r.rating ?? null })), 'date,game_id,platform,country')
    })
  }

  const msg = `${apps.length} uygulama${process.env.PLAY_REPORTS_BUCKET ? '' : ' · indirme/puan için PLAY_REPORTS_BUCKET girilmemiş'}${notes.length ? ' · ' + notes.join(' · ') : ''}`
  await setConnection('google_play', 'connected', msg.slice(0, 500))
  console.log('Google Play:', msg)
}

