// GitHub Actions'ta çalışan veri toplama betiği.
// Anahtarlar ortam değişkeninden gelir (GitHub Secrets). Koda asla yazılmaz.
//
// İşler:
//   daily / manual  → tüm veriler (şimdilik AdMob)
//   policy_check    → politika mailleri ve inceleme durumları (4. aşama)
//   ad_plans        → reklam planları (5. aşama)

import { db, dbReady, setConnection } from './db.mjs'
import { googleReady } from './google.mjs'
import { collectAdmob } from './admob.mjs'

const job = process.argv[2] || 'manual'

if (!dbReady) {
  console.log('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil; iş atlandı.')
  process.exit(0)
}

const [run] = await db('sync_runs', 'POST', { job, status: 'running' })
console.log(`İş başladı: ${job} (#${run.id})`)

const notes = []
const errors = []

async function step(name, fn) {
  try {
    await fn()
    notes.push(`${name}: tamam`)
  } catch (err) {
    console.error(`${name} hatası:`, err)
    errors.push(`${name}: ${String(err.message ?? err).slice(0, 300)}`)
  }
}

if (job === 'daily' || job === 'manual') {
  if (googleReady) {
    await step('AdMob', collectAdmob)
    if (errors.some((e) => e.startsWith('AdMob'))) await setConnection('admob', 'error', errors.find((e) => e.startsWith('AdMob')))
  } else {
    notes.push('AdMob: Google anahtarları girilmemiş, atlandı')
  }
  // TODO 3. aşama: Google Play, App Store Connect
  // TODO 4. aşama: Gmail politika mailleri + Claude analizi
}
// TODO 5. aşama: ad_plans

await db(`sync_runs?id=eq.${run.id}`, 'PATCH', {
  status: errors.length ? 'failed' : 'success',
  finished_at: new Date().toISOString(),
  message: [...notes, ...errors].join(' · ') || 'Yapılacak iş yok',
})
console.log([...notes, ...errors].join('\n'))
if (errors.length) process.exit(1)
