// GitHub Actions'ta çalışan veri toplama betiği.
// Anahtarlar ortam değişkeninden gelir (GitHub Secrets). Koda asla yazılmaz.
//
// İşler:
//   daily / manual  → tüm veriler: AdMob, Google Play, App Store, Gmail + kurallar + Claude analizi + bildirim
//   policy_check    → sürüm/inceleme durumları, yorumlar, Gmail politika mailleri, soruların cevabı + bildirim
//   ad_plans        → reklam planları (5. aşama)

import { db, dbReady, setConnection } from './db.mjs'
import { googleReady } from './google.mjs'
import { collectAdmob } from './admob.mjs'
import { collectPlay, playReady } from './play.mjs'
import { collectAppStore, appStoreReady } from './appstore.mjs'
import { applyRules } from './rules.mjs'
import { collectGmail } from './gmail.mjs'
import { runAi, aiReady } from './ai.mjs'
import { notifyCritical, notifyDaily, pushReady } from './push.mjs'

const job = process.argv[2] || 'manual'

if (!dbReady) {
  console.log('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil; iş atlandı.')
  process.exit(0)
}

const [run] = await db('sync_runs', 'POST', { job, status: 'running' })
console.log(`İş başladı: ${job} (#${run.id})`)

const notes = []
const errors = []

// Bir kaynak hata verse bile diğerleri çalışmaya devam eder
async function step(name, source, ready, fn) {
  if (!ready) return notes.push(`${name}: anahtarlar girilmemiş, atlandı`)
  try {
    await fn()
    notes.push(`${name}: tamam`)
  } catch (err) {
    console.error(`${name} hatası:`, err)
    const msg = `${name}: ${String(err.message ?? err).slice(0, 300)}`
    errors.push(msg)
    if (source) await setConnection(source, 'error', msg).catch(() => {})
  }
}

const light = job === 'policy_check'
if (job === 'daily' || job === 'manual' || light) {
  if (!light) await step('AdMob', 'admob', googleReady, collectAdmob)
  await step('Google Play', 'google_play', playReady, () => collectPlay({ light }))
  await step('App Store', 'app_store', appStoreReady, () => collectAppStore({ light }))
  await step('Gmail', 'gmail', googleReady, () => collectGmail({ days: light ? 7 : 30 }))
  if (!light) await step('Uyarı kuralları', null, true, applyRules)
  // Claude sadece öneri yazar (özet, çözüm adımı, cevap taslağı); hiçbir şeyi uygulamaz
  await step('Claude analizi', 'claude', aiReady, () => runAi({ light }))
  await step('Telefon bildirimi', 'push', pushReady, notifyCritical)
  if (job === 'daily') await step('Günün özeti bildirimi', null, pushReady, notifyDaily)
}
// TODO 5. aşama: ad_plans

await db(`sync_runs?id=eq.${run.id}`, 'PATCH', {
  status: errors.length ? 'failed' : 'success',
  finished_at: new Date().toISOString(),
  message: [...notes, ...errors].join(' · ') || 'Yapılacak iş yok',
})
console.log([...notes, ...errors].join('\n'))
if (errors.length) process.exit(1)
