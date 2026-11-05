import test from 'node:test'
import assert from 'node:assert/strict'
import { budgetState, ecpmDrops } from './guards.mjs'

const NOW = Date.parse('2026-11-20T10:00:00Z')
const d = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10)

test('eCPM düşüşü: dün ortalamanın %30+ altındaysa yakalanır, en çok düşen tür bulunur', () => {
  const rows = []
  for (let n = 2; n <= 15; n++) {
    rows.push({ date: d(n), game_id: 'a', ad_format: 'rewarded', impressions: 1000, revenue: 10 })
    rows.push({ date: d(n), game_id: 'a', ad_format: 'banner', impressions: 1000, revenue: 1 })
  }
  rows.push({ date: d(1), game_id: 'a', ad_format: 'rewarded', impressions: 1000, revenue: 4 })
  rows.push({ date: d(1), game_id: 'a', ad_format: 'banner', impressions: 1000, revenue: 1 })
  const [x] = ecpmDrops(rows, { drop: 30, minImpressions: 500 }, NOW)
  assert.equal(x.gameId, 'a')
  assert.equal(x.ecpm, 2.5)
  assert.equal(x.base, 5.5)
  assert.equal(x.pct, 55)
  assert.deepEqual(x.worst, { format: 'rewarded', pct: 60 })
})

test('eCPM: az gösterimde ya da küçük düşüşte alarm yok', () => {
  const rows = [{ date: d(5), game_id: 'a', impressions: 1000, revenue: 5 }, { date: d(1), game_id: 'a', impressions: 100, revenue: 0 }]
  assert.deepEqual(ecpmDrops(rows, {}, NOW), [])
  rows[1] = { date: d(1), game_id: 'a', impressions: 1000, revenue: 4 }
  assert.deepEqual(ecpmDrops(rows, { drop: 30 }, NOW), [])
})

test('bütçe: %80, %100 ve ani artış', () => {
  const rows = [2, 3, 4, 5, 6, 7, 8].map((n) => ({ date: d(n), spend: 10 }))
  rows.push({ date: d(1), spend: 30 })
  const s = budgetState(rows, { monthly: 120, spike: 2 }, NOW)
  assert.equal(s.spent, 100)
  assert.deepEqual(s.issues.map((i) => i.key), ['budget80-2026-11', `spike-${d(1)}`])
  assert.equal(budgetState(rows, { monthly: 90 }, NOW).issues[0].key, 'budget100-2026-11')
  assert.deepEqual(budgetState(rows, { monthly: null, spike: 0 }, NOW).issues, [])
})

test('bütçe: ay sonu tahmini sınırı aşıyorsa uyarır', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ date: d(n), spend: 10 }))
  const s = budgetState(rows, { monthly: 200, spike: 0 }, NOW)
  assert.equal(s.spent, 70)
  assert.equal(s.forecast, 180)
  assert.equal(budgetState(rows, { monthly: 150, spike: 0 }, NOW).issues[0].key, 'budgetfc-2026-11')
})
