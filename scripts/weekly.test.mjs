import test from 'node:test'
import assert from 'node:assert/strict'
import { countryWeeks } from './weekly.mjs'

test('ülke gelirleri bu hafta / geçen hafta ayrılır, bugün sayılmaz', () => {
  const iso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
  const rows = [
    { date: iso(1), country: 'US', revenue: 2 }, { date: iso(3), country: 'US', revenue: 1 },
    { date: iso(10), country: 'US', revenue: 5 }, { date: iso(0), country: 'US', revenue: 9 },
    { date: iso(2), country: 'TR', revenue: 4 },
  ]
  assert.deepEqual(countryWeeks(rows), [
    { ulke: 'TR', bu_hafta: 4, gecen_hafta: 0 },
    { ulke: 'US', bu_hafta: 3, gecen_hafta: 5 },
  ])
})
