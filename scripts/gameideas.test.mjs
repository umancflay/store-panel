import test from 'node:test'
import assert from 'node:assert/strict'
import { chartDigest } from './gameideas.mjs'

test('liste özeti: ilk sıralar, yeni girenler, yükselenler', () => {
  const free = [
    { name: 'A', genres: ['Games', 'Puzzle'], prev: 1 },
    { name: 'B', genres: ['Games', 'Casual', 'Puzzle', 'Board'], prev: null },
    { name: 'C', genres: ['Games'], prev: 12 },
  ]
  const d = chartDigest({ countries: { us: { free, grossing: [], genres: [['Puzzle', 2]] } } })
  assert.deepEqual(d.us.en_cok_indirilen[1], { sira: 2, oyun: 'B', tur: 'Casual/Puzzle' })
  assert.deepEqual(d.us.yeni_girenler, [{ sira: 2, oyun: 'B', tur: 'Casual/Puzzle' }])
  assert.deepEqual(d.us.yukselenler, [{ sira: 3, oyun: 'C', tur: null, yukselis: 9 }])
  assert.deepEqual(d.us.turler, [['Puzzle', 2]])
  assert.deepEqual(chartDigest(null), {})
})
