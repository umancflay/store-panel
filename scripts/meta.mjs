// Meta (Facebook + Instagram) reklam verilerini çeker, campaigns tablosuna yazar.
// GitHub Secrets: META_ACCESS_TOKEN (ads_read izinli token) ve META_AD_ACCOUNT_ID (act_ ile ya da olmadan;
// birden fazla hesap virgülle ayrılır: "1507573837908002,1367381536942213").
// Sadece okur: kampanya açmaz, bütçe değiştirmez, para harcamaz.
// Harcama hesabın para biriminden USD'ye çevrilir (panel her şeyi USD saklar, ekranda TL'ye çevirir).

import { db, upsert, setConnection } from './db.mjs'

const GRAPH = 'https://graph.facebook.com/v21.0'

export const metaReady = Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)

// Kurulum sayılan aksiyonlar (Meta SDK'sı ya da MMP olmadan genelde boş gelir)
const INSTALL_ACTIONS = ['mobile_app_install', 'app_install', 'omni_app_install', 'app_custom_event.fb_mobile_activate_app']

async function graph(path, params = {}) {
  // Terminalden kopyalarken token satır sonuna bölünebiliyor: boşlukları at
  const token = process.env.META_ACCESS_TOKEN.replace(/\s+/g, '')
  const qs = new URLSearchParams({ ...params, access_token: token })
  const url = path.startsWith('http') ? path : `${GRAPH}/${path}?${qs}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error) {
    const e = data.error
    // 190: token geçersiz/süresi dolmuş, 200/10: izin yok, 100: hesap numarası yanlış
    const why =
      e.code === 190 ? 'Token geçersiz ya da süresi dolmuş. Yeni token üret, GitHub › META_ACCESS_TOKEN içine yapıştır.'
      : e.code === 200 || e.code === 10 ? 'Token\'ın bu reklam hesabına ads_read izni yok.'
      : e.code === 100 ? 'Reklam hesabı numarası yanlış olabilir (META_AD_ACCOUNT_ID).'
      : ''
    throw new Error(`${why} Meta: ${e.message}`.trim())
  }
  return data
}

// Sayfalı listeyi sonuna kadar oku
async function all(path, params) {
  const out = []
  let page = await graph(path, params)
  while (true) {
    out.push(...(page.data ?? []))
    if (!page.paging?.next) break
    page = await graph(page.paging.next)
  }
  return out
}

export async function collectMeta({ light = false } = {}) {
  const ids = process.env.META_AD_ACCOUNT_ID.split(/[\s,]+/).filter(Boolean)
  const notes = []
  const failed = []
  for (const raw of ids) {
    const act = raw.startsWith('act_') ? raw : `act_${raw}`
    try {
      notes.push(await collectAccount(act, light))
    } catch (err) {
      failed.push(`${act}: ${err.message}`)
    }
  }
  // Bir hesap okunamasa da diğerleri yazılır; hepsi okunamazsa hata
  const msg = [...notes, ...failed].join(' · ').slice(0, 500)
  await setConnection('meta', notes.length ? 'connected' : 'error', msg)
  console.log(`Meta: ${msg}`)
  if (!notes.length) throw new Error(failed.join(' · '))
}

async function collectAccount(act, light) {
  const account = await graph(act, { fields: 'name,currency,account_status' })

  // Hesap USD değilse harcamayı günün kuruyla USD'ye çevir (şimdilik TRY ve USD desteklenir)
  let toUsd = () => 1
  if (account.currency === 'TRY') {
    const [fx] = await db('app_settings?select=value&key=eq.fx_usd_try')
    const rates = fx?.value ?? {}
    const days = Object.keys(rates).sort()
    const latest = rates[days[days.length - 1]]
    if (!latest) throw new Error('Hesap TL ama dolar kuru yok; önce "Dolar kuru" adımı çalışmalı.')
    toUsd = (date) => 1 / (rates[date] ?? latest)
  } else if (account.currency !== 'USD') {
    throw new Error(`Hesap para birimi ${account.currency}; sadece USD ve TRY destekleniyor.`)
  }

  // Kampanyaların durumu ve tanıttığı uygulama (oyunla eşlemek için)
  const campaigns = await all(`${act}/campaigns`, { fields: 'id,name,effective_status,objective', limit: '200' })
  const adsets = await all(`${act}/adsets`, { fields: 'campaign_id,promoted_object', limit: '200' })
  const games = await db('games?select=id,name,android_package,ios_app_id')
  const storeUrl = new Map(adsets.filter((a) => a.promoted_object?.object_store_url).map((a) => [a.campaign_id, a.promoted_object.object_store_url]))
  const gameOf = (c) => {
    const url = (storeUrl.get(c.id) ?? '').toLowerCase()
    const name = c.name.toLowerCase()
    return (
      games.find((g) => g.android_package && url.includes(g.android_package.toLowerCase())) ??
      games.find((g) => g.ios_app_id && url.includes(`id${g.ios_app_id}`)) ??
      games.find((g) => g.name && name.includes(g.name.toLowerCase())) ??
      null
    )?.id ?? null
  }
  const byId = new Map(campaigns.map((c) => [c.id, c]))

  // Günlük kampanya bazında harcama; 6 saatlik hafif işte son 3 gün, günlük işte son 30 gün
  const days = light ? 3 : 30
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)
  const insights = await all(`${act}/insights`, {
    level: 'campaign',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
    limit: '500',
  })

  const rows = insights.map((r) => {
    const c = byId.get(r.campaign_id) ?? { id: r.campaign_id, name: r.campaign_name }
    const installs = Math.max(0, ...(r.actions ?? []).filter((a) => INSTALL_ACTIONS.includes(a.action_type)).map((a) => Number(a.value)))
    return {
      platform: 'meta',
      external_id: r.campaign_id,
      game_id: gameOf(c),
      name: r.campaign_name,
      status: c.effective_status ?? null,
      date: r.date_start,
      spend: Math.round(Number(r.spend ?? 0) * toUsd(r.date_start) * 100) / 100,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      installs,
    }
  })
  await upsert('campaigns', rows, 'platform,external_id,date')

  const spend = rows.reduce((a, r) => a + r.spend, 0)
  return `${account.name}: ${campaigns.length} kampanya, son ${days} gün $${spend.toFixed(2)} harcama`
}
