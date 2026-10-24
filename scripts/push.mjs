// Telefona bildirim (Web Push). Ek paket kullanmaz; Node'un kendi şifreleme araçlarıyla çalışır.
// Standartlar: RFC 8291 (mesaj şifreleme, aes128gcm) ve RFC 8292 (VAPID kimliği).
// Anahtarlar GitHub Secrets'tan gelir: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).
// Anahtar üretmek için bilgisayarında bir kez: node scripts/vapid-keys.mjs
//
// Ne zaman gönderilir: açık, kritik ve daha önce bildirilmemiş uyarılar için (alerts.notified_at boş).
// İlk kurulumda eski uyarılar için bildirim yağmuru olmasın diye sadece son 2 günde açılanlar gönderilir.

import crypto from 'node:crypto'
import { db, setConnection } from './db.mjs'

export const pushReady = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

const b64 = (buf) => Buffer.from(buf).toString('base64url')
const unb64 = (s) => Buffer.from(s.trim(), 'base64url')
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest()

// VAPID: push sunucusuna "bu bildirimi ben gönderiyorum" diyen imzalı kısa token
function vapidHeader(endpoint) {
  const pub = unb64(process.env.VAPID_PUBLIC_KEY)
  const d = unb64(process.env.VAPID_PRIVATE_KEY)
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: b64(Buffer.concat([Buffer.alloc(32 - d.length), d])), x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33, 65)) },
    format: 'jwk',
  })
  const head = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const body = b64(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: (process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim(),
  }))
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${head}.${body}.${b64(sig)}, k=${b64(pub)}`
}

// Mesajı sadece o telefonun açabileceği şekilde şifreler (RFC 8291)
// salt ve ecdh sadece testte verilir; normalde her mesaj için yenisi üretilir
export function encrypt(payload, keys, salt = crypto.randomBytes(16), ecdh = null) {
  const uaPublic = unb64(keys.p256dh)
  const authSecret = unb64(keys.auth)
  if (!ecdh) {
    ecdh = crypto.createECDH('prime256v1')
    ecdh.generateKeys()
  }
  const asPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(uaPublic)

  const prkKey = hmac(authSecret, shared)
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12)

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])

  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

// Tek bir telefona gönderir. Abonelik geçersizse (telefon izni kaldırmış) "gone" döner.
export async function sendPush(sub, message) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: encrypt(JSON.stringify(message), sub.keys),
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  return 'ok'
}

export async function notifyCritical() {
  const alerts = await db('alerts?status=eq.open&level=eq.critical&notified_at=is.null&select=id,title,body,game_id,created_at&order=created_at')
  if (!alerts.length) return console.log('Bildirim: yeni kritik uyarı yok')

  // Ayarlar sayfasında "kritik uyarıda bildir"i kapatanlara gönderme (satırı olmayan = açık)
  const off = new Set((await db('user_settings?notify_critical=eq.false&select=user_id')).map((u) => u.user_id))
  const subs = (await db('push_subscriptions?select=endpoint,user_id,keys')).filter((s) => !off.has(s.user_id))

  const fresh = alerts.filter((a) => Date.now() - Date.parse(a.created_at) < 2 * 86400000)
  let sent = 0
  let failed = 0
  for (const a of fresh) {
    const message = {
      title: `Kritik: ${a.title}`.slice(0, 120),
      body: (a.body ?? '').replace(/\s+/g, ' ').slice(0, 160) || 'Panelde ayrıntısına bak.',
      url: './#/uyarilar',
    }
    for (const s of subs) {
      try {
        if ((await sendPush(s, message)) === 'gone') {
          await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, 'DELETE', null, 'return=minimal')
        } else sent++
      } catch (err) {
        failed++
        console.error('Bildirim gönderilemedi:', err.message)
      }
    }
  }

  // Bildirilenleri (ve eski olduğu için atlananları) işaretle; aynı uyarı tekrar gönderilmez
  const ids = alerts.map((a) => a.id).join(',')
  await db(`alerts?id=in.(${ids})`, 'PATCH', { notified_at: new Date().toISOString() }, 'return=minimal')
  await setConnection('push', failed && !sent ? 'error' : 'connected', `${fresh.length} kritik uyarı, ${sent} bildirim gönderildi${failed ? `, ${failed} hata` : ''}`)
  console.log(`Bildirim: ${fresh.length} kritik uyarı, ${subs.length} cihaz, ${sent} gönderildi, ${failed} hata`)
}

// Her sabah günün özeti hazır olunca "günün özetini bildir"i açanlara kısa bildirim
export async function notifyDaily() {
  const today = new Date().toISOString().slice(0, 10)
  const [summary] = await db(`ai_insights?kind=eq.daily_summary&created_at=gte.${today}&select=content&order=created_at.desc&limit=1`)
  if (!summary?.content?.headline) return console.log('Bildirim: bugünün özeti yok')
  const on = new Set((await db('user_settings?notify_daily=eq.true&select=user_id')).map((u) => u.user_id))
  const subs = (await db('push_subscriptions?select=endpoint,user_id,keys')).filter((s) => on.has(s.user_id))
  let sent = 0
  for (const s of subs) {
    try {
      const r = await sendPush(s, { title: 'Günün özeti', body: summary.content.headline.slice(0, 160), url: './#/' })
      if (r === 'gone') await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, 'DELETE', null, 'return=minimal')
      else sent++
    } catch (err) {
      console.error('Özet bildirimi gönderilemedi:', err.message)
    }
  }
  console.log(`Bildirim: günün özeti ${sent} cihaza gönderildi`)
}
