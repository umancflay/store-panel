import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadFile, parseBadging, parseBundletoolManifest } from './bundle.mjs'

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')

const expected = {
  package: 'com.voo.salgin',
  versionCode: 42,
  versionName: '1.1.0',
  minSdk: 23,
  targetSdk: 35,
  debuggable: false,
}

test('parseBundletoolManifest: AAB manifestinden temel alanlar', () => {
  const m = parseBundletoolManifest(fixture('manifest-aab.xml'))
  for (const [k, v] of Object.entries(expected)) assert.equal(m[k], v, k)
  assert.ok(m.permissions.includes('com.google.android.gms.permission.AD_ID'))
  assert.equal(m.permissions.length, 3)
  assert.equal(m.metaData['com.google.android.gms.ads.APPLICATION_ID'], 'ca-app-pub-1111111111111111~2222222222')
})

test('parseBundletoolManifest: debuggable="true" yakalanır', () => {
  const m = parseBundletoolManifest(fixture('manifest-aab.xml').replace('android:debuggable="false"', 'android:debuggable="true"'))
  assert.equal(m.debuggable, true)
})

test('parseBadging: APK özetinden aynı alanlar', () => {
  const m = parseBadging(fixture('badging.txt'))
  for (const [k, v] of Object.entries(expected)) assert.equal(m[k], v, k)
  assert.ok(m.permissions.includes('com.google.android.gms.permission.AD_ID'))
  assert.equal(parseBadging(fixture('badging.txt') + "\napplication-debuggable\n").debuggable, true)
})

test('downloadFile: parçaları sırayla tek dosyada birleştirir', async () => {
  const calls = []
  const fakeFetch = async (url) => {
    calls.push(url)
    const body = url.endsWith('.part0') ? 'AAA' : url.endsWith('.part1') ? 'BBBB' : 'X'
    return new Response(body, { status: 200 })
  }
  const dest = path.join(os.tmpdir(), `bundle-test-${Date.now()}.aab`)
  await downloadFile({ path: 'u/salgin.aab', parts: 2 }, dest, { fetchImpl: fakeFetch, url: 'https://x.supabase.co', key: 'k' })
  assert.equal(fs.readFileSync(dest, 'utf8'), 'AAABBBB')
  assert.deepEqual(calls, [
    'https://x.supabase.co/storage/v1/object/files/u/salgin.aab.part0',
    'https://x.supabase.co/storage/v1/object/files/u/salgin.aab.part1',
  ])
  fs.unlinkSync(dest)
})

test('downloadFile: indirme hatası Türkçe hata fırlatır', async () => {
  const fakeFetch = async () => new Response('yok', { status: 404 })
  const dest = path.join(os.tmpdir(), `bundle-test-${Date.now()}.aab`)
  await assert.rejects(downloadFile({ path: 'a.aab', parts: 1 }, dest, { fetchImpl: fakeFetch, url: 'https://x', key: 'k' }), /indirilemedi/)
})
