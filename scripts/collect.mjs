// GitHub Actions'ta çalışan veri toplama betiği.
// Anahtarlar ortam değişkeninden gelir (GitHub Secrets). Koda asla yazılmaz.
//
// İşler:
//   daily / manual  → tüm veriler: AdMob, Google Play, App Store, Meta reklam, Gmail + kurallar + Claude analizi + bildirim
//   policy_check    → sürüm/inceleme durumları, yorumlar, Gmail politika mailleri, soruların cevabı + bildirim
//   ad_plans        → Meta verisi + Claude'un oyun başına reklam planı (haftalık)

import { db, dbReady, setConnection } from './db.mjs'
import { googleReady } from './google.mjs'
import { collectAdmob } from './admob.mjs'
import { collectFx } from './fx.mjs'
import { collectPlay, playReady } from './play.mjs'
import { collectAppStore, appStoreReady } from './appstore.mjs'
import { collectMeta, metaReady } from './meta.mjs'
import { applyRules } from './rules.mjs'
import { collectGmail } from './gmail.mjs'
import { runAi, aiReady } from './ai.mjs'
import { needsAdPlans, runAdPlans } from './adplans.mjs'
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
// soft: hata işi kırmızıya çevirmez (ör. Claude aboneliğinin limiti dolduğunda veriler yine güncellenir)
async function step(name, source, ready, fn, { soft = false } = {}) {
  if (!ready) return notes.push(`${name}: anahtarlar girilmemiş, atlandı`)
  try {
    await fn()
    notes.push(`${name}: tamam`)
  } catch (err) {
    console.error(`${name} hatası:`, err)
    const msg = `${name}: ${String(err.message ?? err).slice(0, 300)}`
    if (soft) notes.push(`${msg} (atlandı)`)
    else errors.push(msg)
    if (source) await setConnection(source, 'error', msg).catch(() => {})
  }
}

const light = job === 'policy_check'
if (job === 'daily' || job === 'manual' || light) {
  // AdMob 6 saatlik kontrolde de çekilir: "bugün şimdiye kadar" kazanç güncel kalsın
  await step('AdMob', 'admob', googleReady, collectAdmob)
  await step('Dolar kuru', null, true, collectFx)
  await step('Google Play', 'google_play', playReady, () => collectPlay({ light }))
  await step('App Store', 'app_store', appStoreReady, () => collectAppStore({ light }))
  await step('Meta', 'meta', metaReady, () => collectMeta({ light }))
  await step('Gmail', 'gmail', googleReady, () => collectGmail({ days: light ? 7 : 30 }))
  if (!light) await step('Uyarı kuralları', null, true, applyRules)
  // Claude sadece öneri yazar (özet, çözüm adımı, cevap taslağı); hiçbir şeyi uygulamaz
  await step('Claude analizi', 'claude', aiReady, () => runAi({ light }), { soft: true })
  await step('Telefon bildirimi', 'push', pushReady, notifyCritical)
  if (job === 'daily') await step('Günün özeti bildirimi', null, pushReady, notifyDaily)
  // Reklam planı haftada bir; ilk kurulumda ya da plan eskiyse günlük işte de hazırlanır
  if (!light && (await needsAdPlans().catch(() => false))) await step('Reklam planı', 'claude', aiReady, runAdPlans, { soft: true })
}
if (job === 'ad_plans') {
  await step('Meta', 'meta', metaReady, () => collectMeta({}))
  await step('Reklam planı', 'claude', aiReady, runAdPlans, { soft: true })
}

await db(`sync_runs?id=eq.${run.id}`, 'PATCH', {
  status: errors.length ? 'failed' : 'success',
  finished_at: new Date().toISOString(),
  message: [...notes, ...errors].join(' · ') || 'Yapılacak iş yok',
})
console.log([...notes, ...errors].join('\n'))
if (errors.length) process.exit(1)
