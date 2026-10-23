// AdMob'dan günlük gelir verisini çekip Supabase'deki admob_daily tablosuna yazar.
// Gelir her zaman USD olarak istenir.

import { db, upsert, setConnection } from './db.mjs'
import { googleApi } from './google.mjs'

const API = 'https://admob.googleapis.com/v1'

const ymd = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() })
const daysAgo = (n) => new Date(Date.now() - n * 86400000)

// "Taşınma Kaosu" → "tasinmakaosu": oyun adlarını eşleştirmek için
const normalize = (s) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '')

export async function collectAdmob() {
  const { account } = await googleApi(`${API}/accounts`)
  if (!account?.length) throw new Error('Bu Google hesabına bağlı AdMob hesabı bulunamadı.')
  const pub = account[0].name // accounts/pub-123...

  // İlk çalıştırmada son 60 günü, sonra son 3 günü çek (AdMob son günleri sonradan düzeltebilir)
  const existing = await db('admob_daily?select=date&limit=1')
  const fromDays = existing.length > 0 ? 3 : 60

  const report = await googleApi(`${API}/${pub}/networkReport:generate`, {
    reportSpec: {
      dateRange: { startDate: ymd(daysAgo(fromDays)), endDate: ymd(daysAgo(0)) },
      dimensions: ['DATE', 'APP', 'AD_UNIT', 'COUNTRY', 'FORMAT', 'PLATFORM'],
      metrics: ['AD_REQUESTS', 'MATCHED_REQUESTS', 'IMPRESSIONS', 'ESTIMATED_EARNINGS'],
      localizationSettings: { currencyCode: 'USD' },
    },
  })

  const rows = report.filter((r) => r.row).map((r) => r.row)
  const gameIdFor = await gameMapper(rows)

  const out = rows.map(({ dimensionValues: d, metricValues: m }) => {
    const ds = d.DATE.value
    return {
      date: `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`,
      game_id: gameIdFor(d.APP.value),
      platform: d.PLATFORM.value.toLowerCase() === 'ios' ? 'ios' : 'android',
      country: d.COUNTRY?.value || 'ZZ',
      ad_unit_id: d.AD_UNIT.value,
      ad_unit_name: d.AD_UNIT.displayLabel ?? null,
      ad_format: (d.FORMAT?.value ?? '').toLowerCase(),
      requests: Number(m.AD_REQUESTS?.integerValue ?? 0),
      matched_requests: Number(m.MATCHED_REQUESTS?.integerValue ?? 0),
      impressions: Number(m.IMPRESSIONS?.integerValue ?? 0),
      revenue: Number(m.ESTIMATED_EARNINGS?.microsValue ?? 0) / 1e6,
    }
  })

  await upsert('admob_daily', out, 'date,game_id,platform,country,ad_unit_id')
  await setConnection('admob', 'connected', `${out.length} satır güncellendi (son ${fromDays} gün)`)
  console.log(`AdMob: ${out.length} satır yazıldı.`)
}

// AdMob uygulama ID'sini panel oyununa bağlar.
// Önce games.admob_app_ids'e bakar, yoksa adı benzeyen oyunu bulup ID'yi kaydeder,
// o da yoksa yeni oyun olarak ekler. Böylece elle eşleştirme gerekmez.
async function gameMapper(rows) {
  const games = await db('games?select=id,name,platforms,admob_app_ids')
  const map = new Map()
  for (const g of games) for (const a of g.admob_app_ids ?? []) map.set(a, g.id)

  const apps = new Map()
  for (const { dimensionValues: d } of rows) apps.set(d.APP.value, { name: d.APP.displayLabel ?? d.APP.value, platform: d.PLATFORM.value.toLowerCase() === 'ios' ? 'ios' : 'android' })

  for (const [appId, app] of apps) {
    if (map.has(appId)) continue
    // "Brick Gate iOS" ile "Brick Gate: Color Block Puzzle" aynı oyun: platform adını at, baş kısmı karşılaştır
    const n = normalize(app.name)
    const base = normalize(app.name.replace(/\b(ios|android)\b/gi, ''))
    const gBase = (g) => normalize(g.name.replace(/\b(ios|android)\b/gi, ''))
    let game =
      games.find((g) => normalize(g.name) === n) ??
      games.find((g) => base.length >= 4 && (gBase(g).startsWith(base) || base.startsWith(gBase(g))))
    if (game) {
      game.admob_app_ids = [...(game.admob_app_ids ?? []), appId]
      game.platforms = [...new Set([...(game.platforms ?? []), app.platform])]
      await db(`games?id=eq.${encodeURIComponent(game.id)}`, 'PATCH', { admob_app_ids: game.admob_app_ids, platforms: game.platforms }, 'return=minimal')
    } else {
      game = { id: n || appId.replace(/\W/g, ''), name: app.name, platforms: [app.platform], admob_app_ids: [appId] }
      await upsert('games', [game], 'id')
      games.push(game)
    }
    console.log(`Eşleşti: ${app.name} (${appId}) → ${game.id}`)
    map.set(appId, game.id)
  }
  return (appId) => map.get(appId)
}
