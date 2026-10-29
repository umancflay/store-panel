import { test } from 'node:test'
import assert from 'node:assert/strict'
import { processAction, processBuild } from './pipeline.mjs'

const androidBuild = {
  kind: 'aab',
  manifest: { package: 'com.voo.salgin', versionCode: 42, versionName: '1.1.0', minSdk: 23, targetSdk: 36, debuggable: false, permissions: [], metaData: {} },
  abis: [], libs: [], sizeBytes: 1000, hits: [],
}

// Sahte bağımlılıklar: her çağrı kaydedilir, veritabanı yolları basit eşleşmelerle cevaplanır
function deps({ claim = [{ id: 1 }], findings = [], uploadFails = false, actionClaim = [{ id: 9 }] } = {}) {
  const log = []
  const db = async (p, method = 'GET', body) => {
    log.push({ p, method, body })
    if (p.startsWith('store_builds?id=eq.1&status=eq.uploaded')) return claim
    if (p.startsWith('expert_actions?id=eq.9&status=eq.approved')) return actionClaim
    if (p.startsWith('files?')) return [{ path: 'u/salgin.aab', parts: 1, name: 'salgin.aab' }]
    if (p.startsWith('games?')) return [{ id: 'salgin', name: 'Salgın', android_package: 'com.voo.salgin' }]
    if (p.startsWith('store_builds?id=eq.1&select')) return [{ id: 1, game_id: 'salgin', platform: 'android', package_name: 'com.voo.salgin', version_code: 42, version_name: '1.1.0', created_by: 'u@x' }]
    if (p.startsWith('app_settings?')) return []
    if (p.startsWith('store_builds?package_name')) return []
    return []
  }
  return {
    log,
    deps: {
      db,
      downloadFile: async () => log.push({ fn: 'download' }),
      readAndroid: async () => androidBuild,
      runRules: () => findings,
      buildReport: (f) => ({ verdict: f.some((x) => x.severity === 'block') ? 'blocked' : 'clean', counts: {}, text: 'RAPOR' }),
      polish: async () => null,
      uploadBundle: async (o) => {
        log.push({ fn: 'upload', o })
        if (uploadFails) throw new Error('Hizmet hesabının yayınlama izni yok')
        return { versionCode: 42 }
      },
      promote: async (o) => log.push({ fn: 'promote', o }),
      setRollout: async (o) => log.push({ fn: 'rollout', o }),
      notify: async (to, title) => log.push({ fn: 'notify', to, title }),
      today: () => '2026-10-29',
      tmpDir: () => '/tmp',
    },
  }
}
const build = { id: 1, game_id: 'salgin', platform: 'android', file_id: 5, created_by: 'u@x' }
const patches = (log) => log.filter((x) => x.method === 'PATCH' && x.p.startsWith('store_builds?id=eq.1')).map((x) => x.body.status).filter(Boolean)

test('processBuild: başka iş kaptıysa hiçbir şey yapılmaz', async () => {
  const { log, deps: d } = deps({ claim: [] })
  await processBuild(build, d)
  assert.equal(log.filter((x) => x.fn).length, 0)
})

test('processBuild: engelleyici bulgu → yüklenmez, blocked + bildirim', async () => {
  const { log, deps: d } = deps({ findings: [{ id: 'debuggable', severity: 'block', title: 'x', detail: 'y', fix: [] }] })
  await processBuild(build, d)
  assert.equal(log.some((x) => x.fn === 'upload'), false)
  assert.ok(patches(log).includes('blocked'))
  assert.ok(log.find((x) => x.fn === 'notify' && x.to === 'u@x'))
})

test('processBuild: temiz build → dahili teste yüklenir ve üretim onayı açılır', async () => {
  const { log, deps: d } = deps()
  await processBuild(build, d)
  assert.equal(log.find((x) => x.fn === 'upload').o.track, 'internal')
  const action = log.find((x) => x.method === 'POST' && x.p === 'expert_actions')
  assert.deepEqual({ kind: action.body.kind, status: action.body.status, params: action.body.params }, { kind: 'publish_production', status: 'pending', params: { userFraction: 0.1 } })
  assert.deepEqual(patches(log).slice(-2), ['internal', 'awaiting_approval'])
})

test('processBuild: paket adı oyunla uyuşmuyor → engellenir', async () => {
  const { log, deps: d } = deps()
  d.readAndroid = async () => ({ ...androidBuild, manifest: { ...androidBuild.manifest, package: 'com.baska.oyun' } })
  await processBuild(build, d)
  assert.equal(log.some((x) => x.fn === 'upload'), false)
  assert.ok(patches(log).includes('blocked'))
})

test('processBuild: yükleme hatası → failed ve Türkçe hata', async () => {
  const { log, deps: d } = deps({ uploadFails: true })
  await processBuild(build, d)
  const fail = log.find((x) => x.method === 'PATCH' && x.body?.status === 'failed')
  assert.match(fail.body.error, /yayınlama izni/)
})

test('processAction: onaylı değilse çıkar; onaylıysa bir kez üretime taşır', async () => {
  const a = deps()
  await processAction({ id: 9, build_id: 1, kind: 'publish_production', status: 'pending', params: {} }, a.deps)
  assert.equal(a.log.length, 0)

  const b = deps()
  await processAction({ id: 9, build_id: 1, kind: 'publish_production', status: 'approved', params: { userFraction: 0.2 } }, b.deps)
  assert.deepEqual(b.log.find((x) => x.fn === 'promote').o.userFraction, 0.2)
  assert.ok(patches(b.log).includes('live'))

  const c = deps({ actionClaim: [] })
  await processAction({ id: 9, build_id: 1, kind: 'publish_production', status: 'approved', params: {} }, c.deps)
  assert.equal(c.log.some((x) => x.fn === 'promote'), false)
})
