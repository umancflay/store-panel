// Gmail'deki Google Play, AdMob ve App Store politika maillerini okur, uyarıya çevirir.
// İzin: gmail.readonly (sadece okur; mail silmez, göndermez, etiket değiştirmez).
// Refresh token AdMob ile aynıdır; scripts/google-token.mjs Gmail izniyle bir kez daha çalıştırılmalı.
// Her mail alerts tablosuna external_id = "gmail:<mesaj ID>" ile bir kez yazılır.
// "Nasıl düzeltilir" adımlarını sonra Claude ekler (scripts/ai.mjs).

import { db, setConnection } from './db.mjs'
import { googleApi } from './google.mjs'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

// Mağazaların politika ve inceleme maillerini gönderdiği adresler
const SENDERS = [
  'googleplay-noreply@google.com',
  'play-console-noreply@google.com',
  'noreply-play-developer-console@google.com',
  'admob-noreply@google.com',
  'email.apple.com',
]

// Konu ya da metinde bu ifadeler geçen mailler uyarı sayılır (Türkçe ve İngilizce)
const CRITICAL = /\b(suspend|suspension|removed|removal|terminat|rejected|violat|disabled|askıya|kaldırıl|reddedil|ihlal|devre dışı|kapatıl)/i
const WARNING = /\b(policy|politika|action required|işlem gerekli|deadline|son tarih|warning|uyarı|compliance|uyumlu|data safety|veri güvenliği|target api|hedef api|guideline|declaration|beyan|limited|sınırlı|kısıtlama|restriction|out of compliance|not compliant)/i
// İnceleme ve politika konulu mailler (konuya bakılır)
const REVIEW = /(app review|review of your|submission|incelem|guideline|policy|politika|rejected|reddedil|action required|işlem gerekli)/i
// Pazarlama, bülten, sözleşme, abonelik, TestFlight daveti ve hesap girişi mailleri uyarı değildir
const NOISE = /\b(newsletter|webinar|tips|ipuçları|digest|invoice|fatura|receipt|makbuz|welcome to|hoş geldin|sign-in|oturum açma|verification code|doğrulama kodu|payment|ödeme|agreement|sözleşme|subscription|abonel|renewal|yenileme|invited you to test|testflight|api access|icloud|apple hesabı|apple account|accepted the|kabul ettiniz)/i

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
}

const iso = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 ? date.toISOString().slice(0, 10) : null
}

// Metindeki son tarihi bulur: "by November 4, 2026", "4 Kasım 2026", "2026-11-04", "04.11.2026", "within 30 days"
export function findDeadline(text, received) {
  const found = []
  const t = text.toLowerCase()
  for (const m of t.matchAll(/\b([a-zçğıöşü]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    if (MONTHS[m[1]]) found.push(iso(+m[3], MONTHS[m[1]], +m[2]))
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})\b/g)) {
    if (MONTHS[m[2]]) found.push(iso(+m[3], MONTHS[m[2]], +m[1]))
  }
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push(iso(+m[1], +m[2], +m[3]))
  for (const m of t.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) found.push(iso(+m[3], +m[2], +m[1]))
  const within = t.match(/\b(?:within|in)\s+(\d{1,3})\s+days\b|\b(\d{1,3})\s+gün\s+içinde\b/)
  if (within) {
    const d = new Date(received.getTime() + Number(within[1] ?? within[2]) * 86400000)
    found.push(d.toISOString().slice(0, 10))
  }
  // Mail tarihinden sonraki en yakın tarih son tarihtir
  const from = received.toISOString().slice(0, 10)
  return found.filter((d) => d && d >= from).sort()[0] ?? null
}

const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? ''
const decode = (data) => Buffer.from(data, 'base64url').toString('utf8')

function htmlToText(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

// Mailin düz metin gövdesi; yoksa HTML'den çevrilir
function bodyText(part) {
  const plain = []
  const html = []
  const walk = (p) => {
    if (!p) return
    if (p.mimeType === 'text/plain' && p.body?.data) plain.push(decode(p.body.data))
    else if (p.mimeType === 'text/html' && p.body?.data) html.push(decode(p.body.data))
    for (const c of p.parts ?? []) walk(c)
  }
  walk(part)
  return (plain.length ? plain.join('\n') : htmlToText(html.join('\n'))).replace(/\r/g, '').trim()
}

function sourceOf(from) {
  const f = from.toLowerCase()
  if (f.includes('apple.com')) return 'app_store'
  if (f.includes('admob')) return 'admob'
  return 'play'
}

function consoleUrl(source, pkg) {
  if (source === 'app_store') return 'https://appstoreconnect.apple.com/apps'
  if (source === 'admob') return 'https://admob.google.com/v2/policy-center'
  return pkg ? `https://play.google.com/console/developers/app/policy-center?package=${pkg}` : 'https://play.google.com/console/developers/policy-center'
}

export async function collectGmail({ days = 30 } = {}) {
  const games = await db('games?select=id,name,android_package,ios_app_id&active=eq.true')
  const findGame = (text) => {
    const t = text.toLowerCase()
    return (
      games.find((g) => g.android_package && t.includes(g.android_package.toLowerCase())) ??
      games.find((g) => g.ios_app_id && t.includes(String(g.ios_app_id))) ??
      games.find((g) => g.name && t.includes(g.name.toLowerCase())) ??
      null
    )
  }

  const q = `(${SENDERS.map((s) => `from:${s}`).join(' OR ')}) newer_than:${days}d`
  let list
  try {
    list = await googleApi(`${GMAIL}/messages?maxResults=100&q=${encodeURIComponent(q)}`)
  } catch (err) {
    // Gmail henüz kurulmadıysa (izin yok ya da API kapalı) iş hata vermesin; Ayarlar'da "bağlı değil" görünsün
    if (/403|insufficient|scope|has not been used|disabled/i.test(String(err.message))) {
      const msg = 'Gmail izni yok ya da Gmail API kapalı. README › 4. aşama › Adım 2 ve 3.'
      await setConnection('gmail', 'disconnected', msg)
      return console.log(`Gmail: ${msg}`)
    }
    throw err
  }
  const ids = (list.messages ?? []).map((m) => m.id)

  // Daha önce yazılmış mailleri tekrar okuma
  const known = new Set()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50).map((id) => `"gmail:${id}"`).join(',')
    const rows = await db(`alerts?select=external_id&external_id=in.(${encodeURIComponent(chunk)})`)
    for (const r of rows) known.add(r.external_id)
  }

  const alerts = []
  for (const id of ids) {
    if (known.has(`gmail:${id}`)) continue
    const msg = await googleApi(`${GMAIL}/messages/${id}?format=full`)
    const subject = header(msg, 'subject')
    const from = header(msg, 'from')
    const received = new Date(Number(msg.internalDate))
    const text = bodyText(msg.payload) || msg.snippet || ''
    const all = `${subject}\n${text}`
    if (NOISE.test(subject) && !CRITICAL.test(subject)) continue
    // Seviye konuya göre belirlenir: sözleşme gibi uzun metinlerde "terminate" geçmesi uyarı sayılmasın.
    // Gövde sadece inceleme/politika konulu maillerde ağırlaştırır.
    const level = CRITICAL.test(subject) || (REVIEW.test(subject) && CRITICAL.test(text))
      ? 'critical'
      : WARNING.test(subject) || REVIEW.test(subject)
        ? 'warning'
        : null
    if (!level) continue
    const source = sourceOf(from)
    const game = findGame(all)
    alerts.push({
      external_id: `gmail:${id}`,
      level,
      source,
      game_id: game?.id ?? null,
      title: subject.slice(0, 200) || '(konusuz mail)',
      body: text.slice(0, 4000),
      deadline: findDeadline(all, received),
      console_url: consoleUrl(source, game?.android_package),
      mail_from: from.slice(0, 200),
      mail_date: received.toISOString(),
    })
  }

  // Aynı mail iki kez yazılmasın; varsa dokunma (çözüldü işaretlenen uyarı tekrar açılmaz)
  if (alerts.length) await db('alerts?on_conflict=external_id', 'POST', alerts, 'resolution=ignore-duplicates,return=minimal')
  await setConnection('gmail', 'connected', `${ids.length} mail tarandı, ${alerts.length} yeni uyarı`)
  console.log(`Gmail: ${ids.length} mail tarandı, ${alerts.length} yeni uyarı`)
}
