// Claude'un oyun başına reklam planı: kime, nerede, ne bütçeyle, hangi kreatifle.
// Gerçek veriye dayanır: Meta reklamlarının yaş-cinsiyet / platform / ülke sonuçları, kampanya harcamaları,
// AdMob'un ülke bazında geliri, mağaza indirmeleri ve puanı, Google Play oyuncu kırılımları (ülke, dil, cihaz, Android sürümü).
// Sadece öneri yazar (ad_plans tablosu). Kampanya açmaz, bütçe değiştirmez, para harcamaz.
// Haftada bir (pazartesi) ya da son plan 7 günden eskiyse günlük işte çalışır.

import { db, setConnection } from './db.mjs'
import { metrics, parse, runClaude } from './ai.mjs'

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const r2 = (v) => Math.round(v * 100) / 100

// Reklam verilecek oyunlar (Ayarlar'dan değiştirilebilir: app_settings › ad_games)
const DEFAULT_GAMES = ['salgin', 'stockguys', 'haulguys']

const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: ['game_id', 'learned', 'audience', 'countries', 'budget', 'creatives', 'platforms'],
  properties: {
    game_id: { type: 'string' },
    learned: { type: 'array', items: { type: 'string' } },
    audience: {
      type: 'object',
      additionalProperties: false,
      required: ['age', 'gender', 'interests', 'similarGames'],
      properties: {
        age: { type: 'string' },
        gender: { type: 'string' },
        interests: { type: 'array', items: { type: 'string' } },
        similarGames: { type: 'array', items: { type: 'string' } },
      },
    },
    countries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tier', 'list', 'why'],
        properties: { tier: { type: 'string' }, list: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } },
      },
    },
    budget: {
      type: 'object',
      additionalProperties: false,
      required: ['daily', 'days', 'stopRule', 'scaleRule'],
      properties: { daily: { type: 'number' }, days: { type: 'number' }, stopRule: { type: 'string' }, scaleRule: { type: 'string' } },
    },
    creatives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'idea'],
        properties: { type: { type: 'string', enum: ['Video', 'Görsel'] }, idea: { type: 'string' } },
      },
    },
    platforms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'fit', 'why'],
        properties: { name: { type: 'string' }, fit: { type: 'string', enum: ['Yüksek', 'Orta', 'Düşük'] }, why: { type: 'string' } },
      },
    },
  },
}
const SCHEMA = { type: 'object', additionalProperties: false, required: ['plans'], properties: { plans: { type: 'array', items: PLAN } } }

// Kırılımları tek tabloda topla: anahtar başına harcama, tıklama, sonuç, sonuç başına maliyet
function sumBy(rows) {
  const m = new Map()
  for (const r of rows) {
    const a = m.get(r.key) ?? { key: r.key, harcama_usd: 0, gosterim: 0, tiklama: 0, sonuc: 0 }
    a.harcama_usd += Number(r.spend)
    a.gosterim += Number(r.impressions)
    a.tiklama += Number(r.clicks)
    a.sonuc += Number(r.results)
    m.set(r.key, a)
  }
  return [...m.values()]
    .map((a) => ({ ...a, harcama_usd: r2(a.harcama_usd), sonuc_basi_usd: a.sonuc ? r2(a.harcama_usd / a.sonuc) : null }))
    .sort((a, b) => b.sonuc - a.sonuc || b.tiklama - a.tiklama)
    .slice(0, 15)
}

// Google Play toplu raporları: boyut başına en çok kurulum yapan 8 anahtar (son 30 gün).
// phase8 SQL'i çalıştırılmadıysa ya da rapor yoksa boş döner.
async function playPlayers(gameId) {
  let rows
  try {
    rows = await db('rpc/play_breakdown_summary', 'POST', { p_game: gameId, p_from: day(30) })
  } catch {
    return null
  }
  if (!rows?.length) return null
  const pick = (dim) =>
    rows
      .filter((r) => r.dimension === dim)
      .slice(0, 8)
      .map((r) => ({
        key: r.key,
        kurulum: Number(r.installs),
        kaldirma: Number(r.uninstalls),
        kaldirma_orani: Number(r.installs) ? r2(Number(r.uninstalls) / Number(r.installs)) : null,
        aktif_cihaz: r.active_devices == null ? null : Number(r.active_devices),
      }))
  return { ulke: pick('country'), dil: pick('language'), cihaz: pick('device'), android_surumu: pick('os_version'), uygulama_surumu: pick('app_version') }
}

export async function needsAdPlans() {
  const [last] = await db('ad_plans?select=created_at&order=created_at.desc&limit=1')
  return !last || last.created_at < day(7)
}

export async function runAdPlans() {
  const [setting] = await db('app_settings?select=value&key=eq.ad_games')
  const ids = setting?.value?.games ?? DEFAULT_GAMES
  const games = (await db('games?select=id,name,genre,installs,ratings_count,android_package,ios_app_id')).filter((g) => ids.includes(g.id))
  if (!games.length) return console.log('Reklam planı: oyun seçilmemiş')

  const stats = await metrics(games)
  const campaigns = await db(`campaigns?date=gte.${day(30)}&select=platform,name,game_id,objective,result_type,spend,impressions,clicks,results,status`)
  const breakdowns = await db('ad_breakdowns?select=game_id,dimension,key,spend,impressions,clicks,results')
  const admob = await db(`admob_daily?date=gte.${day(30)}&select=game_id,country,revenue`)
  const players = Object.fromEntries(await Promise.all(games.map(async (g) => [g.id, g.android_package ? await playPlayers(g.id) : null])))

  const ctx = {
    oyunlar: games.map((g) => {
      const mine = campaigns.filter((c) => c.game_id === g.id)
      const countries = new Map()
      for (const r of admob.filter((r) => r.game_id === g.id)) countries.set(r.country, (countries.get(r.country) ?? 0) + Number(r.revenue ?? 0))
      return {
        game_id: g.id,
        oyun: g.name,
        tur: g.genre,
        toplam_indirme: g.installs,
        puan_sayisi: g.ratings_count,
        magazalar: { android: Boolean(g.android_package), ios: Boolean(g.ios_app_id) },
        son_14_gun: stats.find((s) => s.game_id === g.id) ?? null,
        admob_gelir_ulkeler_usd: [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ ulke: k, gelir: r2(v) })),
        // Play yaş/cinsiyet vermez; yaş ve cinsiyet sadece reklam_kitlesi_son_30_gun'den gelir
        play_oyunculari_son_30_gun: players[g.id],
        bu_oyunun_kampanyalari: mine.length ? sumBy(mine.map((c) => ({ ...c, key: c.name }))) : [],
      }
    }),
    // Stüdyonun tüm Meta reklamları (oyuna bağlanmamış Instagram profil reklamları dahil): kitleyi şekillendirmek için
    reklam_kitlesi_son_30_gun: {
      yas_cinsiyet: sumBy(breakdowns.filter((b) => b.dimension === 'age_gender')),
      platform_yerlesim: sumBy(breakdowns.filter((b) => b.dimension === 'placement')),
      ulke: sumBy(breakdowns.filter((b) => b.dimension === 'country')),
    },
  }

  const prompt = [
    `Bugün: ${new Date().toISOString().slice(0, 10)}.`,
    'Görev: "oyunlar" listesindeki HER oyun için bir reklam planı (plans) hazırla.',
    '- learned: Veriden öğrendiklerin, 2-4 madde, rakamla (ör. "Sonuçların %78\'i 18-34 yaş erkekten, sonuç başı $0,05"). Veri yoksa "Henüz reklam verisi yok" de.',
    '- audience: Veriye göre yaş aralığı, cinsiyet ("Hepsi" ya da "Ağırlıkla erkek" gibi), ilgi alanları (Meta\'da seçilebilecek), benzer oyunlar.',
    '- countries: 2-3 kademe (test / ölçek / sonra); AdMob gelirinin, reklam sonuçlarının ve Play\'de organik kurulumun iyi, kaldırma oranının düşük olduğu ülkeleri öne al.',
    '- play_oyunculari_son_30_gun varsa: dil (kreatif dili), cihaz ve Android sürümü (düşük donanım mı, hedeflemeye etkisi) ve kaldırma oranı yüksek ülke/sürümleri learned\'e yaz.',
    '- budget: daily USD (küçük stüdyo, $3-$15 arası), days, ne zaman durdurulur, ne zaman büyütülür.',
    '- creatives: 3 kreatif fikri (oyunun türüne uygun, ilk 3 saniyede kanca).',
    '- platforms: Meta (Instagram/Facebook), TikTok, Google Ads, Apple Ads uygunluğu.',
    'Her bütçe önerisi para harcatır: "onayınla" diye belirt. Veride olmayan rakam uydurma.',
    '',
    'Veri (JSON):',
    JSON.stringify(ctx),
  ].join('\n')

  let result
  try {
    result = parse(await runClaude(prompt, SCHEMA))
  } catch (err) {
    await setConnection('claude', 'error', String(err.message).slice(0, 300))
    throw err
  }
  const valid = new Set(games.map((g) => g.id))
  const rows = (result.plans ?? []).filter((p) => valid.has(p.game_id)).map(({ game_id, ...content }) => ({ game_id, content }))
  if (rows.length) await db('ad_plans', 'POST', rows, 'return=minimal')
  console.log(`Reklam planı: ${rows.length} oyun`)
}
