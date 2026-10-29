import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { playError, setRollout, uploadBundle } from './publish.mjs'

const A = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.voo.salgin'
const U = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/com.voo.salgin'

function recorder(responses = {}) {
  const calls = []
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? 'GET', body: typeof opts.body === 'string' ? JSON.parse(opts.body) : null })
    const key = Object.keys(responses).find((k) => url.includes(k))
    if (key) return responses[key]()
    if (url.endsWith('/edits')) return Response.json({ id: 'E1' })
    if (url.includes('/bundles') || url.includes('/apks')) return Response.json({ versionCode: 42 })
    if (url.includes('/tracks/production') && (opts.method ?? 'GET') === 'GET')
      return Response.json({ track: 'production', releases: [{ versionCodes: ['42'], status: 'inProgress', userFraction: 0.1 }] })
    return Response.json({})
  }
  return { calls, fetchImpl }
}

const tmpFile = (ext) => {
  const f = path.join(os.tmpdir(), `pub-${Date.now()}${ext}`)
  fs.writeFileSync(f, 'AAB')
  return f
}
const token = async () => 't'

test('uploadBundle: dahili test — edit, yükleme, kanal, commit sırası', async () => {
  const { calls, fetchImpl } = recorder()
  const r = await uploadBundle({ pkg: 'com.voo.salgin', filePath: tmpFile('.aab'), track: 'internal', fetchImpl, tokenImpl: token })
  assert.deepEqual(r, { versionCode: 42 })
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.split('?')[0]}`), [
    `POST ${A}/edits`,
    `POST ${U}/edits/E1/bundles`,
    `PUT ${A}/edits/E1/tracks/internal`,
    `POST ${A}/edits/E1:commit`,
  ])
  assert.deepEqual(calls[2].body.releases[0], { versionCodes: ['42'], status: 'completed' })
})

test('uploadBundle: üretim — kademeli yüzde ve sürüm notları; APK uç noktası', async () => {
  const { calls, fetchImpl } = recorder()
  await uploadBundle({
    pkg: 'com.voo.salgin', filePath: tmpFile('.apk'), track: 'production', userFraction: 0.1,
    notes: [{ language: 'tr-TR', text: 'Yeni bölüm' }], fetchImpl, tokenImpl: token,
  })
  assert.ok(calls[1].url.includes('/apks?uploadType=media'))
  assert.deepEqual(calls[2].body.releases[0], { versionCodes: ['42'], status: 'inProgress', userFraction: 0.1, releaseNotes: [{ language: 'tr-TR', text: 'Yeni bölüm' }] })
})

test('uploadBundle: hata → edit silinir, Türkçe hata', async () => {
  const { calls, fetchImpl } = recorder({ '/bundles': () => new Response('{"error":{"message":"APK specifies a version code that has already been used."}}', { status: 403 }) })
  await assert.rejects(uploadBundle({ pkg: 'com.voo.salgin', filePath: tmpFile('.aab'), track: 'internal', fetchImpl, tokenImpl: token }), /sürüm kodu daha önce kullanılmış/)
  assert.equal(calls.at(-1).method, 'DELETE')
})

test('setRollout: yüzde artırma ve durdurma', async () => {
  const a = recorder()
  await setRollout({ pkg: 'com.voo.salgin', versionCode: 42, userFraction: 0.5, fetchImpl: a.fetchImpl, tokenImpl: token })
  const put = a.calls.find((c) => c.method === 'PUT')
  assert.deepEqual(put.body.releases[0], { versionCodes: ['42'], status: 'inProgress', userFraction: 0.5 })

  const b = recorder()
  await setRollout({ pkg: 'com.voo.salgin', versionCode: 42, userFraction: 1, fetchImpl: b.fetchImpl, tokenImpl: token })
  assert.deepEqual(b.calls.find((c) => c.method === 'PUT').body.releases[0], { versionCodes: ['42'], status: 'completed' })

  const c = recorder()
  await setRollout({ pkg: 'com.voo.salgin', versionCode: 42, userFraction: 'halt', fetchImpl: c.fetchImpl, tokenImpl: token })
  assert.equal(c.calls.find((x) => x.method === 'PUT').body.releases[0].status, 'halted')
})

test('playError: Türkçe eşlemeler', () => {
  assert.match(playError(404, 'Package not found: com.x'), /Play'de yok/)
  assert.match(playError(403, 'version code that has already been used'), /sürüm kodu daha önce kullanılmış/)
  assert.match(playError(403, 'The caller does not have permission'), /yayınlama izni/)
})

test('promote: dahili testteki sürümü üretime %10 taşır', async () => {
  const { calls, fetchImpl } = recorder()
  const { promote } = await import('./publish.mjs')
  await promote({ pkg: 'com.voo.salgin', versionCode: 42, userFraction: 0.1, fetchImpl, tokenImpl: token })
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
    `POST ${A}/edits`,
    `PUT ${A}/edits/E1/tracks/production`,
    `POST ${A}/edits/E1:commit`,
  ])
  assert.deepEqual(calls[1].body.releases[0], { versionCodes: ['42'], status: 'inProgress', userFraction: 0.1 })
})
