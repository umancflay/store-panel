// AdMob'dan günlük gelir verisini çekip Supabase'deki admob_daily tablosuna yazar.
// Gelir her zaman USD olarak istenir.

import { db, upsert, setConnection } from './db.mjs'
import { googleApi } from './google.mjs'
import { gameLinker } from './games.mjs'

const API = 'https://admob.googleapis.com/v1'

const ymd = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() })
const daysAgo = (n) => new Date(Date.now() - n * 86400000)

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

// AdMob uygulama ID'lerini paneldeki oyunlara bağlar (scripts/games.mjs)
async function gameMapper(rows) {
  const link = await gameLinker()
  const map = new Map()
  for (const { dimensionValues: d } of rows) {
    if (map.has(d.APP.value)) continue
    const platform = d.PLATFORM.value.toLowerCase() === 'ios' ? 'ios' : 'android'
    map.set(d.APP.value, await link({ name: d.APP.displayLabel ?? d.APP.value, platform, admobAppId: d.APP.value }))
  }
  return (appId) => map.get(appId)
}
