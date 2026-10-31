import test from 'node:test'
import assert from 'node:assert/strict'
import { earningHidden } from './admob.mjs'

test('gizli oyun gelir getirince listelenir; gelirsiz ya da görünür oyunlar listelenmez', () => {
  const games = [{ id: 'brick', name: 'Brick Gate', hidden: true }, { id: 'toy', name: 'Toy-Nado', hidden: true }, { id: 'borsa', name: 'Borsa', hidden: false }]
  const rows = [
    { game_id: 'brick', revenue: 0.1 }, { game_id: 'brick', revenue: 0.07 },
    { game_id: 'toy', revenue: 0.01 },
    { game_id: 'borsa', revenue: 0.5 },
  ]
  const out = earningHidden(rows, games)
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'brick')
  assert.ok(Math.abs(out[0].revenue - 0.17) < 1e-9)
})
