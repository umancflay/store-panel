import { test } from 'node:test'
import assert from 'node:assert/strict'
import { goalProgress, revenueDrop, trDay } from './goals.mjs'

const week = (start, values) => Object.fromEntries(values.map((v, i) => {
  const d = new Date(start + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + i)
  return [d.toISOString().slice(0, 10), v]
}))

test('dün ortalamanın yarısının altına düştüyse uyarır', () => {
  const days = week('2026-10-21', [10, 10, 10, 10, 10, 10, 10, 3]) // 21–27 ortalama 10, 28 = 3
  const d = revenueDrop(days, '2026-10-29')
  assert.equal(d.date, '2026-10-28')
  assert.equal(Math.round(d.pct), 70)
})

test('küçük düşüşte ya da küçük gelirde uyarmaz', () => {
  assert.equal(revenueDrop(week('2026-10-21', [10, 10, 10, 10, 10, 10, 10, 7]), '2026-10-29'), null)
  assert.equal(revenueDrop(week('2026-10-21', [2, 2, 2, 2, 2, 2, 2, 0]), '2026-10-29'), null) // ortalama ₺5 altı
})

test('dünün verisi yoksa uyarmaz', () => {
  assert.equal(revenueDrop(week('2026-10-20', [10, 10, 10, 10, 10, 10, 10]), '2026-10-29'), null)
})

test('ay gidişatı: şimdiye kadar, tahmin, günlük ihtiyaç', () => {
  const days = week('2026-10-01', Array(28).fill(10)) // 1–28 Ekim, günde 10
  const p = goalProgress(days, '2026-10-29', 400)
  assert.equal(p.sofar, 280)
  assert.equal(p.left, 3) // 29, 30, 31
  assert.equal(p.projected, 310)
  assert.equal(p.need, 40)
  assert.equal(p.ratio, 0.7)
})

test('ayın ilk günü son 7 günün ortalamasıyla tahmin eder', () => {
  const p = goalProgress(week('2026-10-25', Array(7).fill(5)), '2026-11-01', 300)
  assert.equal(p.sofar, 0)
  assert.equal(p.projected, 150)
})

test('Türkiye günü UTC gece yarısından önce değişir', () => {
  assert.equal(trDay(new Date('2026-10-28T22:30:00Z')), '2026-10-29')
})
