// Google Play verilerini çeker:
//   - Çökme ve ANR oranı (Play Developer Reporting API)
//   - Son yorumlar ve sürüm durumu (Android Publisher API)
//   - Günlük indirme ve puan (Play Console raporları, Cloud Storage; PLAY_REPORTS_BUCKET girildiyse)
//   - Oyuncu kırılımları: ülke, dil, cihaz, Android sürümü, uygulama sürümü (aynı raporlar → play_breakdowns)
// Giriş: Google Cloud servis hesabı (GOOGLE_PLAY_SA_JSON), Play Console'da kullanıcı olarak davet edilmiş olmalı.

import crypto from 'node:crypto'
import { db, upsert, setConnection } from './db.mjs'
import { playStorePage } from './storepage.mjs'
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

// Play Console CSV raporları UTF-16 olarak gelir. Cihaz adlarında virgül olabilir, tırnaklı alanları da okur.
function parseCsv(buf) {
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le').slice(1) : buf.toString('utf8').replace(/^\uFEFF/, '')
  const split = (line) => {
    const out = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted && ch === '"' && line[i + 1] === '"') (cur += '"'), i++
      else if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) out.push(cur), (cur = '')
      else cur += ch
    }
    out.push(cur)
    return out.map((v) => v.trim())
  }
  const [head, ...lines] = text.trim().split(/\r?\n/)
  const cols = split(head)
  return lines.filter(Boolean).map((l) => Object.fromEntries(split(l).map((v, i) => [cols[i], v])))
}

const reportBucket = () => process.env.PLAY_REPORTS_BUCKET?.trim().replace(/^gs:\/\//, '').split('/')[0]

// Bu ay ve geçen ay (yyyymm)
const reportMonths = () =>
  [0, 1].map((i) => {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - i)
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })

// Kovadan bir rapor dosyası; o ay için rapor yoksa null
async function reportFile(bucket, file) {
  try {
    return parseCsv(await api(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(file)}?alt=media`, { raw: true }))
  } catch (e) {
    if (String(e.message).includes(': 404')) return null
    if (String(e.message).includes(': 403')) throw new Error('rapor klasörüne erişim yok (Play Console izni 24 saate kadar sürebilir)')
    throw e
  }
}

async function installsAndRatings(pkg) {
  const bucket = reportBucket()
  if (!bucket) return []
  const byDate = new Map()
  for (const m of reportMonths()) {
    for (const [kind, file] of [['installs', `stats/installs/installs_${pkg}_${m}_overview.csv`], ['ratings', `stats/ratings/ratings_${pkg}_${m}_overview.csv`]]) {
      const rows = await reportFile(bucket, file)
      for (const r of rows ?? []) {
        const e = byDate.get(r.Date) ?? { date: r.Date }
        if (kind === 'installs') e.downloads = Number(r['Daily User Installs'] ?? r['Install events'] ?? 0)
        else e.rating = Number(r['Total Average Rating']) || null
        byDate.set(r.Date, e)
      }
    }
  }
  return [...byDate.values()]
}

// Oyuncu kırılımları: rapor dosyasının adı → panelde boyut adı ve CSV'deki sütun
const DIMENSIONS = [
  ['overview', 'overview', null],
  ['country', 'country', 'Country'],
  ['language', 'language', 'Language'],
  ['device', 'device', 'Device'],
  ['os_version', 'os_version', 'Android OS Version'],
  ['app_version', 'app_version', 'App Version Code'],
]
const KEEP = 50 // boyut ve ay başına en çok bu kadar anahtar (yüzlerce cihaz modeli tabloyu şişirmesin)

const num = (v) => (v === undefined || v === '' ? null : Number(v) || 0)

async function playerBreakdowns(pkg, gameId) {
  const bucket = reportBucket()
  if (!bucket) return []
  const out = []
  for (const m of reportMonths()) {
    for (const [file, dimension, col] of DIMENSIONS) {
      const rows = await reportFile(bucket, `stats/installs/installs_${pkg}_${m}_${file}.csv`)
      if (!rows?.length) continue
      // Sütun adı değişirse: tarih, paket ve sayı olmayan ilk sütun boyuttur
      const keyCol = col && col in rows[0] ? col : col && Object.keys(rows[0]).find((c) => !['Date', 'Package Name'].includes(c) && !/Installs|Uninstalls|Upgrades|events/i.test(c))
      const mapped = rows.map((r) => ({
        game_id: gameId,
        date: r.Date,
        dimension,
        key: (keyCol ? r[keyCol] : 'ALL') || 'Bilinmiyor',
        installs: num(r['Daily User Installs']) ?? num(r['Install events']) ?? 0,
        uninstalls: num(r['Daily User Uninstalls']) ?? num(r['Uninstall events']) ?? 0,
        active_devices: num(r['Active Device Installs']),
      }))
      // Aynı gün aynı anahtar iki kez gelirse topla (ör. boş anahtarlar "Bilinmiyor"da birleşir)
      const merged = new Map()
      for (const r of mapped) {
        const k = `${r.date}|${r.key}`
        const a = merged.get(k)
        if (!a) merged.set(k, r)
        else {
          a.installs += r.installs
          a.uninstalls += r.uninstalls
          a.active_devices = a.active_devices == null && r.active_devices == null ? null : (a.active_devices ?? 0) + (r.active_devices ?? 0)
        }
      }
      const score = new Map()
      for (const r of merged.values()) score.set(r.key, (score.get(r.key) ?? 0) + r.installs + (r.active_devices ?? 0))
      const top = new Set([...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, KEEP).map(([k]) => k))
      out.push(...[...merged.values()].filter((r) => top.has(r.key) && /^\d{4}-\d{2}-\d{2}$/.test(r.date)))
    }
  }
  return out
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
    await safe('mağaza sayfası', async () => {
      // Herkese açık Play sayfası: ikon, toplam indirme, puan (oyun yayında değilse yok)
      const page = await playStorePage(pkg)
      if (!page) return
      await db(`games?id=eq.${encodeURIComponent(gameId)}`, 'PATCH', {
        ...(page.icon ? { icon_url: page.icon } : {}),
        installs: page.installs, installs_label: page.installsLabel, ratings_count: page.ratingsCount,
      }, 'return=minimal')
      if (page.rating) {
        const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        await upsert('store_daily', [{ ...key, date: day, rating: page.rating }], 'date,game_id,platform,country')
      }
    })
    await safe('indirme', async () => {
      const rows = await installsAndRatings(pkg)
      const withD = rows.filter((r) => r.downloads !== undefined)
      if (withD.length) await upsert('store_daily', withD.map((r) => ({ ...key, date: r.date, downloads: r.downloads, rating: r.rating ?? null })), 'date,game_id,platform,country')
    })
    await safe('oyuncular', async () => {
      const rows = await playerBreakdowns(pkg, gameId)
      if (rows.length) await upsert('play_breakdowns', rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), 'game_id,date,dimension,key')
    })
  }

  const msg = `${apps.length} uygulama${process.env.PLAY_REPORTS_BUCKET ? '' : ' · indirme/puan için PLAY_REPORTS_BUCKET girilmemiş'}${notes.length ? ' · ' + notes.join(' · ') : ''}`
  await setConnection('google_play', 'connected', msg.slice(0, 500))
  console.log('Google Play:', msg)
}

