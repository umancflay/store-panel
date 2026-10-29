import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judge, splitByVersion, watchLive } from './watch.mjs'

const row = (vc, rate, users) => ({
  dimensions: [{ dimension: 'versionCode', stringValue: String(vc) }],
  metrics: [{ metric: 'crashRate', decimalValue: { value: String(rate) } }, { metric: 'distinctUsers', decimalValue: { value: String(users) } }],
})

test('saatlik satırlar yeni/eski sürüme göre kullanıcı ağırlıklı ortalanır', () => {
  const s = splitByVersion([row(42, 0.02, 100), row(42, 0.04, 100), row(41, 0.005, 1000)], 'crashRate', 42)
  assert.equal(s.users, 200)
  assert.ok(Math.abs(s.newRate - 3) < 1e-9)
  assert.ok(Math.abs(s.oldRate - 0.5) < 1e-9)
})

test('çökme eşiği ve eskinin iki katı aşıldıysa kötü', () => {
  assert.equal(judge({ crash: { newRate: 3, oldRate: 0.5, users: 200 }, anr: null }).verdict, 'bad')
  assert.equal(judge({ crash: { newRate: 3, oldRate: 0.5, users: 10 }, anr: null }).verdict, 'wait') // az kullanıcı: karar yok
  assert.equal(judge({ crash: { newRate: 0.3, oldRate: 0.3, users: 500 }, anr: { newRate: 0.1, oldRate: 0.1, users: 500 } }).verdict, 'ok')
  assert.equal(judge({ crash: { newRate: 0.8, oldRate: 0.4, users: 500 }, anr: null }).verdict, 'warn')
})

function fakeDb(build, calls) {
  return async (path, method, body) => {
    calls.push([path, method, body])
    if (path.startsWith('store_builds?status=eq.live')) return [build]
    if (path.startsWith('expert_actions?build_id') && path.includes('publish_production')) return [{ approved_at: new Date(Date.now() - 3600000).toISOString() }]
    if (path.startsWith('expert_actions?build_id') && path.includes('halt')) return []
    return null
  }
}

test('kötüyse durdurma önerisi açılır (onay bekler) ve bir kez bildirilir', async () => {
  const calls = []
  const notes = []
  const b = { id: 7, package_name: 'p', version_code: 42, version_name: '1.2', report: {} }
  await watchLive({ db: fakeDb(b, calls), notify: async (...a) => notes.push(a), vitals: async () => ({ crash: { newRate: 4, oldRate: 0.5, users: 300 }, anr: null }) })
  const halt = calls.find(([p, m]) => p === 'expert_actions' && m === 'POST')
  assert.deepEqual([halt[2].kind, halt[2].status], ['halt', 'pending'])
  assert.equal(notes.length, 1)
  const saved = calls.find(([p, m]) => p === 'store_builds?id=eq.7' && m === 'PATCH')[2].report.watch
  assert.equal(saved.alerted, true)
  assert.equal(saved.done, false)
})

test('48 saat temiz geçince nöbet biter ve haber verir', async () => {
  const calls = []
  const notes = []
  const since = new Date(Date.now() - 49 * 3600000).toISOString()
  const b = { id: 8, package_name: 'p', version_code: 42, version_name: '1.3', report: { watch: { since, at: since } } }
  await watchLive({ db: fakeDb(b, calls), notify: async (...a) => notes.push(a), vitals: async () => ({ crash: { newRate: 0.2, oldRate: 0.3, users: 900 }, anr: null }) })
  assert.match(notes[0][1], /48 saat sorunsuz/)
  assert.equal(calls.find(([p, m]) => p === 'store_builds?id=eq.8' && m === 'PATCH')[2].report.watch.done, true)
})
