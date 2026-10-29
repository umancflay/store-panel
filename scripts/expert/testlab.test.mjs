import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matrixFinding, pickDevice, runRobo } from './testlab.mjs'

const catalog = {
  versions: [{ id: '30', apiLevel: 30 }, { id: '33', apiLevel: 33 }, { id: '34', apiLevel: 34 }],
  models: [
    { id: 'oriole', form: 'PHYSICAL', supportedAbis: ['arm64-v8a'], supportedVersionIds: ['34'] },
    { id: 'MediumPhone.arm', name: 'Medium Phone', form: 'VIRTUAL', supportedAbis: ['arm64-v8a'], supportedVersionIds: ['30', '33', '34'] },
    { id: 'Pixel2', form: 'VIRTUAL', supportedAbis: ['x86'], supportedVersionIds: ['34'] },
    { id: 'old.arm', form: 'VIRTUAL', supportedAbis: ['arm64-v8a'], supportedVersionIds: ['34'], tags: ['deprecated'] },
  ],
}

test('arm64 sanal cihazın en yeni sürümü seçilir; fiziksel, x86 ve eski cihaz seçilmez', () => {
  assert.deepEqual(pickDevice(catalog), { androidModelId: 'MediumPhone.arm', androidVersionId: '34', name: 'Medium Phone', api: 34 })
  assert.equal(pickDevice(catalog, 35), null)
})

test('çökme engelleyici, başarı bilgi, geçersiz uyarı olur', () => {
  const url = 'https://console.firebase.google.com/x'
  assert.equal(matrixFinding({ state: 'FINISHED', outcomeSummary: 'FAILURE', resultStorage: { resultsUrl: url } }).severity, 'block')
  assert.match(matrixFinding({ state: 'FINISHED', outcomeSummary: 'FAILURE', resultStorage: { resultsUrl: url } }).fix[0], /console\.firebase/)
  assert.equal(matrixFinding({ state: 'FINISHED', outcomeSummary: 'SUCCESS' }).severity, 'info')
  assert.equal(matrixFinding({ state: 'INVALID', invalidMatrixDetails: 'NO_SIGNATURE' }).severity, 'warn')
})

const sa = JSON.stringify({ project_id: 'p' })
const respond = (map) => async (url) => {
  const hit = Object.keys(map).find((k) => url.includes(k))
  const [status, body] = map[hit] ?? [404, {}]
  return { ok: status < 300, status, text: async () => JSON.stringify(body) }
}

test('faturalandırma açıksa ya da doğrulanamıyorsa test yapılmaz (para harcanmaz)', async () => {
  process.env.GOOGLE_PLAY_SA_JSON = sa
  const on = await runRobo({ filePath: 'x.aab', buildId: 1, tokenImpl: async () => 't', fetchImpl: respond({ billingInfo: [200, { billingEnabled: true }] }) })
  assert.match(on.skipped, /faturalandırma açık/)
  const denied = await runRobo({ filePath: 'x.aab', buildId: 1, tokenImpl: async () => 't', fetchImpl: respond({ billingInfo: [403, {}] }) })
  assert.match(denied.skipped, /doğrulanamadı/)
})
