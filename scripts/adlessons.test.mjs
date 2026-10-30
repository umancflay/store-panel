import test from 'node:test'
import assert from 'node:assert/strict'
import { computeLessons } from './adlessons.mjs'

const camp = (id, date, spend, impressions, clicks, results, game = 'salgin') => ({ platform: 'meta', external_id: id, game_id: game, date, spend, impressions, clicks, results })

test('yayımlanan video bağlı kampanyayla kıyaslanır: ucuzsa iyi', () => {
  const projects = [{ id: 'p1', gameId: 'salgin', status: 'published', publishedAt: '2026-10-10T10:00:00Z', publishedOn: 'TikTok', campaignIds: ['meta:A'], idea: { title: 'Kurtarış', hook: 'h' } }]
  const campaigns = [
    camp('A', '2026-10-09', 100, 99999, 999, 1), // yayından önce: sayılmaz
    camp('A', '2026-10-11', 10, 5000, 100, 25), // 0,40 $
    camp('B', '2026-10-11', 20, 5000, 50, 20), // 1,00 $ (oyunun diğer reklamı)
  ]
  const [l] = computeLessons(projects, campaigns)
  assert.equal(l.verdict, 'iyi')
  assert.equal(l.cpr, 0.4)
  assert.equal(l.avgCpr, 1)
  assert.match(l.text, /%60 ucuz/)
})

test('az veride hüküm verilmez', () => {
  const projects = [{ id: 'p1', gameId: 'salgin', status: 'published', publishedAt: '2026-10-10', campaignIds: ['meta:A'], idea: { title: 'X' } }]
  const [l] = computeLessons(projects, [camp('A', '2026-10-11', 2, 300, 3, 1)])
  assert.equal(l.verdict, 'erken')
})

test('reddedilen fikirler sebebiyle ders olur, bağlantısız projeler atlanır', () => {
  const projects = [
    { id: 'p2', gameId: 'salgin', status: 'pick', rejected: [{ title: 'Borsa paniği', reason: 'oyunda borsa yok' }] },
    { id: 'p3', gameId: 'salgin', status: 'published', idea: { title: 'Y' } },
  ]
  const l = computeLessons(projects, [])
  assert.equal(l.length, 1)
  assert.equal(l[0].kind, 'rejected')
  assert.match(l[0].text, /oyunda borsa yok/)
})
