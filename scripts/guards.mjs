// Korumalar: para kaybını erken haber veren iki bekçi. Sadece uyarı ve bildirim üretir;
// kampanya durdurmaz, bütçe değiştirmez, mağazada hiçbir şeye dokunmaz.
//   1) eCPM düşüşü: dünkü eCPM (1000 gösterim başına kazanç) son 14 günün ortalamasından %X düştüyse
//   2) Bütçe bekçisi: bu ayki toplam reklam harcaması sınırın %80'ine / %100'üne geldiyse, ay sonu tahmini sınırı aşıyorsa
//      ya da dünkü harcama son 7 günün ortalamasının N katıysa
// Ayarlar: app_settings.guards (Reklam sayfasındaki "Bütçe bekçisi" ve Gelir sayfasındaki "eCPM alarmı" kartları).

import { db } from './db.mjs'

export const DEFAULT_GUARDS = { ecpm: { enabled: true, drop: 30, minImpressions: 500 }, budget: { enabled: true, monthly: null, spike: 2 } }

const day = (n, now = Date.now()) => new Date(now - n * 86400000).toISOString().slice(0, 10)
const r2 = (v) => Math.round(v * 100) / 100
const usd = (v) => `$${r2(v).toFixed(2)}`
const fmt = { banner: 'banner', interstitial: 'geçiş', rewarded: 'ödüllü', rewarded_interstitial: 'ödüllü geçiş', app_open: 'açılış', native: 'yerel' }

// Oyun başına dün ve önceki 14 günün eCPM'i; düşüş eşiği aşanlar.
// rows: admob_daily satırları {date, game_id, ad_format, impressions, revenue}
export function ecpmDrops(rows, { drop = 30, minImpressions = 500 } = {}, now = Date.now()) {
  const y = day(1, now)
  const from = day(15, now)
  const games = new Map()
  for (const r of rows) {
    if (r.date < from || r.date > y) continue
    const g = games.get(r.game_id) ?? { y: { imp: 0, rev: 0 }, base: { imp: 0, rev: 0 }, fy: new Map(), fb: new Map() }
    const bucket = r.date === y ? g.y : g.base
    const fm = r.date === y ? g.fy : g.fb
    const imp = Number(r.impressions ?? 0)
    const rev = Number(r.revenue ?? 0)
    bucket.imp += imp
    bucket.rev += rev
    const f = fm.get(r.ad_format ?? 'diğer') ?? { imp: 0, rev: 0 }
    f.imp += imp
    f.rev += rev
    fm.set(r.ad_format ?? 'diğer', f)
    games.set(r.game_id, g)
  }
  const out = []
  for (const [gameId, g] of games) {
    if (g.y.imp < minImpressions || g.base.imp < minImpressions) continue
    const now$ = (g.y.rev / g.y.imp) * 1000
    const was = (g.base.rev / g.base.imp) * 1000
    if (!was) continue
    const pct = ((was - now$) / was) * 100
    if (pct < drop) continue
    // En çok düşen reklam türü (en az 100 gösterim)
    let worst = null
    for (const [f, v] of g.fy) {
      const b = g.fb.get(f)
      if (!b || v.imp < 100 || b.imp < 100) continue
      const p = (((b.rev / b.imp) - (v.rev / v.imp)) / (b.rev / b.imp)) * 100
      if (!worst || p > worst.pct) worst = { format: f, pct: Math.round(p) }
    }
    out.push({ gameId, date: y, ecpm: r2(now$), base: r2(was), pct: Math.round(pct), worst })
  }
  return out.sort((a, b) => b.pct - a.pct)
}

// Bu ayki harcama, ay sonu tahmini ve ani artış. rows: campaigns satırları {date, spend} (USD)
export function budgetState(rows, { monthly = null, spike = 2 } = {}, now = Date.now()) {
  const today = day(0, now)
  const month = today.slice(0, 7)
  const y = day(1, now)
  const byDay = new Map()
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + Number(r.spend ?? 0))
  const spent = [...byDay].filter(([d]) => d.startsWith(month)).reduce((a, [, v]) => a + v, 0)
  const last7 = [2, 3, 4, 5, 6, 7, 8].map((n) => byDay.get(day(n, now)) ?? 0)
  const avg7 = last7.reduce((a, b) => a + b, 0) / 7
  const d = new Date(now)
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  const daysLeft = daysInMonth - d.getUTCDate() + 1
  const recent = [1, 2, 3, 4, 5, 6, 7].map((n) => byDay.get(day(n, now)) ?? 0).reduce((a, b) => a + b, 0) / 7
  const forecast = spent + recent * daysLeft
  const yesterday = byDay.get(y) ?? 0
  const issues = []
  if (monthly) {
    const used = (spent / monthly) * 100
    if (used >= 100) issues.push({ key: `budget100-${month}`, level: 'critical', title: `Reklam bütçesi doldu: bu ay ${usd(spent)} / ${usd(monthly)}`, body: `Bu ayki reklam harcaması belirlediğin ${usd(monthly)} sınırına ulaştı. Kampanyalar çalışmaya devam ediyor; durdurmak istersen aşağıdaki adımlarla durdur.` })
    else if (used >= 80) issues.push({ key: `budget80-${month}`, level: 'warning', title: `Reklam bütçesinin %${Math.round(used)}'i harcandı (${usd(spent)} / ${usd(monthly)})`, body: `Ay bitmeden sınıra yaklaştın. Bu hızla ay sonunda yaklaşık ${usd(forecast)} harcanacak.` })
    else if (forecast > monthly * 1.05) issues.push({ key: `budgetfc-${month}`, level: 'warning', title: `Bu hızla ay sonunda ${usd(forecast)} harcanacak (sınır ${usd(monthly)})`, body: `Son 7 günde günde ortalama ${usd(recent)} harcanıyor. Sınırda kalmak için günlük bütçeyi yaklaşık ${usd(Math.max(0, (monthly - spent) / daysLeft))}'a indirmen gerekir.` })
  }
  if (spike && avg7 >= 1 && yesterday >= avg7 * spike) {
    issues.push({ key: `spike-${y}`, level: 'warning', title: `Dün reklama ${usd(yesterday)} harcandı (normalde ${usd(avg7)})`, body: `Dünkü harcama son 7 günün ortalamasının ${r2(yesterday / avg7)} katı. Bütçe ya da teklif değişikliği, yeni kampanya veya hatalı ayar olabilir.` })
  }
  return { month, spent: r2(spent), forecast: r2(forecast), yesterday: r2(yesterday), avg7: r2(avg7), issues }
}

const BUDGET_FIX = [
  'Google Ads: ads.google.com › Kampanyalar › kampanyanın yanındaki durum noktası › Duraklat (ya da Bütçe sütunundan günlük bütçeyi düşür).',
  'Meta: Reklam Yöneticisi › Kampanyalar › kampanyanın anahtarını kapat.',
  'Apple Ads: ads.apple.com › Kampanyalar › kampanyayı seç › Duraklat.',
  'Panel kampanyaları kendisi durdurmaz; değişikliği sen yaparsın.',
]
const ECPM_FIX = [
  'AdMob › Raporlar\'da dünü ülke ve reklam birimine göre aç: düşüş tek bir ülkeden mi geliyor bak (ör. ABD gösterimleri azaldıysa eCPM doğal olarak düşer).',
  'AdMob › Mediation\'da teklif veren ağlardan biri durmuş mu kontrol et (ağ hesabındaki ödeme/politika uyarıları).',
  'Yeni sürümde reklam yerleşimi ya da sıklığı değiştiyse onu geri al.',
  'Ay başlarında ve tatil sonrasında reklam fiyatları genelde düşer; 2–3 gün sürüyorsa normaldir.',
]

async function setting(key) {
  try {
    return (await db(`app_settings?select=value&key=eq.${key}`))[0]?.value ?? null
  } catch {
    return null
  }
}

// Yeni uyarıları ekler (aynı external_id varsa dokunmaz: çözüldü işaretlediğin uyarı tekrar açılmaz), yeni olanlar için bildirim
async function raise(alerts) {
  if (!alerts.length) return 0
  const fresh = await db('alerts?on_conflict=external_id', 'POST', alerts, 'resolution=ignore-duplicates,return=representation')
  for (const a of fresh ?? []) {
    await db('notify_outbox', 'POST', { title: a.title.slice(0, 80), body: (a.body ?? '').slice(0, 160), url: a.source === 'admob' ? './#/gelir' : './#/reklamlar' }, 'return=minimal').catch(() => {})
  }
  return fresh?.length ?? 0
}

export async function runGuards() {
  const cfg = await setting('guards')
  const g = { ecpm: { ...DEFAULT_GUARDS.ecpm, ...cfg?.ecpm }, budget: { ...DEFAULT_GUARDS.budget, ...cfg?.budget } }
  const games = await db('games?select=id,name&active=eq.true&hidden=is.false')
  const name = (id) => games.find((x) => x.id === id)?.name ?? id
  const alerts = []

  if (g.ecpm.enabled) {
    const rows = await db(`admob_daily?select=date,game_id,ad_format,impressions,revenue&date=gte.${day(15)}&limit=50000`)
    for (const d of ecpmDrops(rows, g.ecpm)) {
      if (!games.some((x) => x.id === d.gameId)) continue
      const worst = d.worst && d.worst.pct > 0 ? ` En çok düşen: ${fmt[d.worst.format] ?? d.worst.format} reklamlar (%${d.worst.pct}).` : ''
      alerts.push({
        external_id: `ecpm-${d.gameId}-${d.date}`, level: d.pct >= 50 ? 'critical' : 'warning', source: 'admob', game_id: d.gameId,
        title: `${name(d.gameId)}: eCPM %${d.pct} düştü (${usd(d.ecpm)}, normalde ${usd(d.base)})`,
        body: `Dün 1000 gösterim başına ${usd(d.ecpm)} kazanıldı; son 14 günün ortalaması ${usd(d.base)}.${worst}`,
        how_to_fix: ECPM_FIX.join('\n'), console_url: 'https://admob.google.com/v2/reports',
      })
    }
  }

  if (g.budget.enabled) {
    const rows = await db(`campaigns?select=date,spend&date=gte.${day(40)}&limit=20000`).catch(() => [])
    const st = budgetState(rows, g.budget)
    for (const i of st.issues) {
      alerts.push({ external_id: i.key, level: i.level, source: 'system', title: i.title, body: i.body, how_to_fix: BUDGET_FIX.join('\n'), console_url: '#/reklamlar' })
    }
  }

  const n = await raise(alerts)
  console.log(`Korumalar: ${alerts.length} bulgu, ${n} yeni uyarı`)
}
