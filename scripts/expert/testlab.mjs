// Firebase Test Lab: build'i sanal bir telefonda açıp Robo ile 5 dakika oynatır (kendi kendine dokunarak gezer).
// Çökerse engelleyici bulgu olur, Play'e yüklenmez. Sadece ücretsiz planda çalışır (Spark: günde 10 sanal cihaz testi);
// projede faturalandırma açıksa ya da bu doğrulanamazsa test yapılmaz — para harcanmaz.

import fs from 'node:fs'
import crypto from 'node:crypto'
import { saToken } from '../play.mjs'

const TESTING = 'https://testing.googleapis.com/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Arm64 destekli sanal cihazlardan en yeni Android sürümü (Unity oyunları arm64 ister)
export function pickDevice(catalog, minSdk = 21) {
  const versions = new Map((catalog.versions ?? []).map((v) => [v.id, Number(v.apiLevel)]))
  const models = (catalog.models ?? []).filter((m) => ['VIRTUAL', 'EMULATOR'].includes(m.form) && (m.supportedAbis ?? []).includes('arm64-v8a') && !(m.tags ?? []).includes('deprecated'))
  let best = null
  for (const m of models) {
    for (const v of m.supportedVersionIds ?? []) {
      const api = versions.get(v) ?? Number(v)
      if (!(api >= minSdk)) continue
      const score = api * 10 + (m.id === 'MediumPhone.arm' ? 5 : 0) + ((m.tags ?? []).includes('default') ? 2 : 0)
      if (!best || score > best.score) best = { score, androidModelId: m.id, androidVersionId: v, name: m.name ?? m.id, api }
    }
  }
  return best && { androidModelId: best.androidModelId, androidVersionId: best.androidVersionId, name: best.name, api: best.api }
}

// Test sonucunu bulguya çevirir
export function matrixFinding(matrix, device) {
  const url = matrix.resultStorage?.resultsUrl
  const where = device ? `${device.name} (Android API ${device.api})` : 'sanal telefon'
  const err = (matrix.testExecutions ?? []).map((e) => e.testDetails?.errorMessage).filter(Boolean)[0]
  const look = url ? [`Sonuçları aç: ${url} (video, ekran görüntüleri ve logcat orada).`] : []
  if (matrix.state === 'INVALID')
    return { id: 'testlab-invalid', severity: 'warn', title: 'Test cihazında denenemedi', detail: `Test Lab build'i kabul etmedi (${matrix.invalidMatrixDetails ?? 'bilinmeyen sebep'}).`, fix: ['Build\'in imzalı ve arm64 içerdiğinden emin ol.', ...look] }
  switch (matrix.outcomeSummary) {
    case 'SUCCESS':
      return { id: 'testlab-ok', severity: 'info', title: 'Test cihazında sorunsuz açıldı ve oynandı', detail: `${where} üzerinde Robo oyunu kendi kendine 5 dakika gezdi; çökme ya da donma olmadı.`, fix: look }
    case 'FAILURE':
      return {
        id: 'testlab-crash', severity: 'block', title: 'Test cihazında çöktü ya da dondu',
        detail: `${where} üzerinde oyun ${err ? `şu hatayla durdu: ${err}` : 'açılırken ya da oynanırken çöktü/dondu'}. Bu sürüm oyunculara giderse aynı şey onlarda da olur.`,
        fix: [...look, 'Logcat\'te "FATAL EXCEPTION" ya da "ANR" satırını bul; hangi sınıf geçtiğine bak.', 'Unity: Development Build açıp aynı cihaz sürümünde (emülatör) dene; düzeltip yeni build bırak.'],
      }
    case 'INCONCLUSIVE':
    case 'SKIPPED':
      return { id: 'testlab-unclear', severity: 'info', title: 'Test cihazı denemesi sonuçsuz', detail: `Test Lab bir sonuca varamadı${err ? ` (${err})` : ''}; genelde giriş ekranı ya da altyapı sorunu.`, fix: look }
    default:
      return { id: 'testlab-unclear', severity: 'info', title: 'Test cihazı denemesi bitmedi', detail: `Test ${matrix.state ?? 'bilinmeyen'} durumunda kaldı.`, fix: look }
  }
}

export async function runRobo({ filePath, buildId, minSdk, fetchImpl = fetch, tokenImpl = saToken, pollMs = 20000, maxWaitMs = 25 * 60000 }) {
  const project = JSON.parse(process.env.GOOGLE_PLAY_SA_JSON).project_id
  const call = async (url, { method = 'GET', body, raw, type } = {}) => {
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${await tokenImpl()}`, 'Content-Type': type ?? 'application/json' },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    })
    const text = await res.text()
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${text.slice(0, 300)}`), { status: res.status })
    return text ? JSON.parse(text) : {}
  }

  // Para harcamama güvencesi: faturalandırma kapalı olmalı
  const billing = await call(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`).catch((e) => ({ error: e }))
  if (billing.error) return { skipped: `ücretsiz plan doğrulanamadı (${billing.error.status ?? 'hata'})` }
  if (billing.billingEnabled) return { skipped: 'Firebase projesinde faturalandırma açık; ücret çıkmasın diye test yapılmadı' }

  const { defaultBucket } = await call(`https://www.googleapis.com/toolresults/v1beta3/projects/${project}:initializeSettings`, { method: 'POST' })
  if (!defaultBucket) return { skipped: 'Test Lab sonuç kovası oluşturulamadı' }
  const device = pickDevice((await call(`${TESTING}/testEnvironmentCatalog/ANDROID?projectId=${project}`)).androidDeviceCatalog ?? {}, minSdk)
  if (!device) return { skipped: 'uygun sanal cihaz bulunamadı' }

  const isApk = filePath.toLowerCase().endsWith('.apk')
  const name = `uzman/build-${buildId}-${Date.now()}${isApk ? '.apk' : '.aab'}`
  await call(`https://storage.googleapis.com/upload/storage/v1/b/${defaultBucket}/o?uploadType=media&name=${encodeURIComponent(name)}`, { method: 'POST', raw: fs.readFileSync(filePath), type: 'application/octet-stream' })
  const gcsPath = `gs://${defaultBucket}/${name}`

  let matrix = await call(`${TESTING}/projects/${project}/testMatrices?requestId=${crypto.randomUUID()}`, {
    method: 'POST',
    body: {
      testSpecification: { testTimeout: '300s', androidRoboTest: isApk ? { appApk: { gcsPath } } : { appBundle: { bundleLocation: { gcsPath } } } },
      environmentMatrix: { androidDeviceList: { androidDevices: [{ androidModelId: device.androidModelId, androidVersionId: device.androidVersionId, locale: 'en', orientation: 'portrait' }] } },
      resultStorage: { googleCloudStorage: { gcsPath: `gs://${defaultBucket}/uzman/results/build-${buildId}-${Date.now()}/` } },
      flakyTestAttempts: 0,
    },
  })
  const start = Date.now()
  while (!['FINISHED', 'ERROR', 'INVALID', 'CANCELLED'].includes(matrix.state) && Date.now() - start < maxWaitMs) {
    await sleep(pollMs)
    matrix = await call(`${TESTING}/projects/${project}/testMatrices/${matrix.testMatrixId}`)
  }
  return { finding: matrixFinding(matrix, device), device, url: matrix.resultStorage?.resultsUrl ?? null }
}
