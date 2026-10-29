// Yayın Uzmanı işi (GitHub Actions, .github/workflows/expert.yml). Claude kullanmaz.
//   node scripts/expert.mjs check  → App Store inceleme durumunu günceller; yapılacak iş var mı (yeni build, onaylanmış eylem, yayın nöbeti, koçluk isteği); GITHUB_OUTPUT'a has/model/builds
//   node scripts/expert.mjs        → build'leri işler, onaylı eylemleri uygular, eski dosyaları temizler, bildirimleri gönderir

import fs from 'node:fs'
import os from 'node:os'
import { db, dbReady } from './db.mjs'
import { flushOutbox } from './push.mjs'
import { downloadFile, readAndroid } from './expert/bundle.mjs'
import { readIos } from './expert/ios.mjs'
import iosRules from '../uzman/kurallar/ios.mjs'
import { runRules } from './expert/rules.mjs'
import { buildReport } from './expert/report.mjs'
import { polish } from './expert/llm.mjs'
import { promote, setRollout, uploadBundle } from './expert/publish.mjs'
import { cleanupOldFiles, processAction, processBuild } from './expert/pipeline.mjs'
import { queueOf, runQueue } from './expert/coach.mjs'
import { runRobo } from './expert/testlab.mjs'
import { dueBuilds, versionVitals, watchLive } from './expert/watch.mjs'
import { syncReviews } from './expert/appreview.mjs'
import { lessonsOf } from './expert/ask.mjs'
import { api as ascApi, appStoreReady } from './appstore.mjs'

if (!dbReady) {
  console.log('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil; iş atlandı.')
  process.exit(0)
}

async function maybe(p) {
  try {
    return await db(p)
  } catch {
    return [] // phase11 SQL'i çalıştırılmamış
  }
}

const pendingBuilds = () => maybe('store_builds?status=eq.uploaded&select=id,game_id,platform,file_id,created_by&order=created_at&limit=3')
const approvedActions = () => maybe('expert_actions?status=eq.approved&select=id,build_id,kind,params,status&order=approved_at')

const notifyOutbox = (to, title, body, link) => db('notify_outbox', 'POST', { to_email: to, title, body, url: link }, 'return=minimal').catch(() => {})

if (process.argv[2] === 'check') {
  // App Store inceleme durumu her kontrolde (birkaç saniye): değişim varsa hemen telefona
  if (appStoreReady) {
    const n = await syncReviews({ db, ascApi, notify: notifyOutbox }).catch((e) => console.error('App Store inceleme takibi:', e.message))
    if (n) await flushOutbox()
  }
  const builds = (await pendingBuilds()).length > 0
  const items = await queueOf(db).catch(() => [])
  const queue = items.length > 0
  const needsModel = items.some((i) => ['aso', 'notes', 'rejection', 'ask'].includes(i.kind))
  const has = builds || queue || (await approvedActions()).length > 0 || (await dueBuilds(db)).length > 0
  // Model (Ollama) sadece rapor/öneri yazılacaksa kurulur; nöbet ve onaylı eylemler için gerekmez
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `has=${has}\nmodel=${builds || needsModel}\nbuilds=${builds}\n`)
  console.log(has ? 'Yayın Uzmanı için iş var' : 'Yayın Uzmanı için iş yok')
  process.exit(0)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const deps = {
  db,
  downloadFile,
  readAndroid,
  readIos,
  lessons: () => lessonsOf(db),
  iosRules,
  runRules,
  buildReport,
  polish,
  uploadBundle,
  promote,
  setRollout,
  testLab: (o) => runRobo(o),
  // Test ekran görüntüleri gizli "files" kovasına; panel imzalı bağlantıyla gösterir
  storeShot: async (p, buf) => {
    const res = await fetch(`${url}/storage/v1/object/files/${p}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'image/png', 'x-upsert': 'true', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) },
      body: buf,
    })
    if (!res.ok) throw new Error(`Ekran görüntüsü kaydedilemedi: ${res.status}`)
    return p
  },
  vitals: (pkg, vc) => versionVitals(pkg, vc),
  today: () => new Date().toISOString().slice(0, 10),
  tmpDir: () => os.tmpdir(),
  notify: notifyOutbox,
  removeFile: async (f) => {
    const prefixes = f.parts > 1 ? Array.from({ length: f.parts }, (_, i) => `${f.path}.part${i}`) : [f.path]
    await fetch(`${url}/storage/v1/object/files`, {
      method: 'DELETE',
      headers: { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ prefixes }),
    })
  },
}

for (const b of await pendingBuilds()) {
  console.log(`Build #${b.id} işleniyor`)
  await processBuild(b, deps)
}
for (const a of await approvedActions()) {
  console.log(`Eylem #${a.id} (${a.kind}) uygulanıyor`)
  await processAction(a, deps)
}
const coached = await runQueue(deps).catch((e) => console.error('Koçluk hatası:', e.message))
if (coached) console.log(`Koçluk: ${coached} iş`)
const watched = await watchLive(deps).catch((e) => console.error('Nöbet hatası:', e.message))
if (watched) console.log(`Yayın nöbeti: ${watched} sürüm`)
await cleanupOldFiles(deps).catch((e) => console.error('Temizlik hatası:', e.message))
await flushOutbox()
console.log('Yayın Uzmanı: bitti')
