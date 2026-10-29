import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runRules } from './rules.mjs'
import { buildReport } from './report.mjs'

// Temiz bir build: hiçbir kural tetiklenmemeli
function ctx(over = {}) {
  const base = {
    build: {
      kind: 'aab',
      manifest: {
        package: 'com.voo.salgin', versionCode: 42, versionName: '1.1.0', minSdk: 23, targetSdk: 36, debuggable: false,
        permissions: ['android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID'], metaData: {},
      },
      abis: ['arm64-v8a', 'armeabi-v7a'],
      libs: [{ abi: 'arm64-v8a', name: 'libil2cpp.so', align: 16384 }, { abi: 'armeabi-v7a', name: 'libil2cpp.so', align: 16384 }],
      sizeBytes: 80 * 1024 * 1024,
      hits: ['Lcom/google/android/gms/ads/'],
    },
    prev: { versionCode: 41 },
    game: { id: 'salgin', name: 'Salgın' },
    declared: { ads: true, ad_id: true, device_id: true, analytics: false, crash_logs: false, location: false, personal: false },
    today: '2026-10-29',
  }
  const c = structuredClone(base)
  for (const [k, v] of Object.entries(over)) {
    if (k === 'manifest') Object.assign(c.build.manifest, v)
    else if (k in c.build) c.build[k] = v
    else c[k] = v
  }
  return c
}
const ids = (c) => runRules(c).map((f) => f.id)

test('temiz build: bulgu yok', () => {
  assert.deepEqual(ids(ctx()), [])
})

test('version-code-not-increased', () => {
  assert.ok(ids(ctx({ prev: { versionCode: 42 } })).includes('version-code-not-increased'))
  assert.ok(!ids(ctx({ prev: null })).includes('version-code-not-increased'))
})

test('target-sdk-too-low: tarihe göre eşik', () => {
  assert.ok(ids(ctx({ manifest: { targetSdk: 35 } })).includes('target-sdk-too-low'))
  assert.ok(!ids(ctx({ manifest: { targetSdk: 35 }, today: '2026-01-10' })).includes('target-sdk-too-low'))
})

test('debuggable ve test reklam kimliği engelleyici', () => {
  const f = runRules(ctx({ manifest: { debuggable: true }, hits: ['ca-app-pub-3940256099942544'] }))
  assert.ok(f.find((x) => x.id === 'debuggable' && x.severity === 'block'))
  assert.ok(f.find((x) => x.id === 'test-ad-id' && x.severity === 'block'))
})

test('no-arm64: native kütüphane var ama arm64 yok', () => {
  assert.ok(ids(ctx({ abis: ['armeabi-v7a'], libs: [{ abi: 'armeabi-v7a', name: 'libmain.so', align: 4096 }] })).includes('no-arm64'))
  assert.ok(!ids(ctx({ abis: [], libs: [] })).includes('no-arm64'))
})

test('page-size-16k: 4 KB hizalı kütüphane', () => {
  const f = runRules(ctx({ libs: [{ abi: 'arm64-v8a', name: 'libgame.so', align: 4096 }] }))
  const r = f.find((x) => x.id === 'page-size-16k')
  assert.ok(r)
  assert.equal(r.severity, 'block')
  assert.match(r.detail, /libgame\.so/)
})

test('ad-id-permission-missing: reklam SDK var, AD_ID izni yok', () => {
  assert.ok(ids(ctx({ manifest: { permissions: ['android.permission.INTERNET'] } })).includes('ad-id-permission-missing'))
})

test('sensitive-permissions', () => {
  const f = runRules(ctx({ manifest: { permissions: ['com.google.android.gms.permission.AD_ID', 'android.permission.ACCESS_FINE_LOCATION'] } }))
  assert.match(f.find((x) => x.id === 'sensitive-permissions').detail, /ACCESS_FINE_LOCATION/)
})

test('data-safety: uyumsuzluk ve beyan yok', () => {
  assert.ok(ids(ctx({ declared: { ads: false, ad_id: false } })).includes('data-safety-mismatch'))
  assert.ok(ids(ctx({ declared: null })).includes('data-safety-undeclared'))
})

test('big-download', () => {
  assert.ok(ids(ctx({ sizeBytes: 250 * 1024 * 1024 })).includes('big-download'))
})

test('bulgular ciddiyete göre sıralı', () => {
  const f = runRules(ctx({ declared: null, manifest: { debuggable: true } }))
  assert.deepEqual(f.map((x) => x.severity), [...f.map((x) => x.severity)].sort((a, b) => ['block', 'warn', 'info'].indexOf(a) - ['block', 'warn', 'info'].indexOf(b)))
})

test('buildReport: engelleyici varsa blocked ve ilk satır', () => {
  const f = runRules(ctx({ manifest: { debuggable: true }, hits: ['ca-app-pub-3940256099942544', 'Lcom/google/android/gms/ads/'] }))
  const r = buildReport(f, { gameName: 'Salgın', versionName: '1.1.0', versionCode: 42 })
  assert.equal(r.verdict, 'blocked')
  assert.equal(r.counts.block, 2)
  assert.equal(r.text.split('\n')[0], 'Salgın 1.1.0 (42) · Yüklenemez: 2 engelleyici sorun')
})

test('buildReport: temiz', () => {
  const r = buildReport([], { gameName: 'Salgın', versionName: '1.1.0', versionCode: 42 })
  assert.equal(r.verdict, 'clean')
  assert.match(r.text, /Sorun bulunmadı/)
})
