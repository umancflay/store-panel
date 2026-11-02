import test from 'node:test'
import assert from 'node:assert/strict'
import { matchGame, parseDaily } from './firebase.mjs'

const games = [{ id: 'salgin', name: 'Salgın', android_package: 'com.voo.salgin' }, { id: 'brick', name: 'Brick Gate: Color Block Puzzle', android_package: null }]

test('mülk önce Android paket adıyla, yoksa adla oyuna bağlanır', () => {
  assert.equal(matchGame({ displayName: 'x' }, [{ androidAppStreamData: { packageName: 'com.voo.salgin' } }], games), 'salgin')
  assert.equal(matchGame({ displayName: 'Brick Gate' }, [{ displayName: 'iOS' }], games), 'brick')
  assert.equal(matchGame({ displayName: 'Bambaşka' }, [], games), null)
})

test('günlük rapor tarih ve platforma göre toplanır', () => {
  const rows = parseDaily({
    rows: [
      { dimensionValues: [{ value: '20261102' }, { value: 'Android' }], metricValues: [{ value: '5' }, { value: '40' }] },
      { dimensionValues: [{ value: '20261102' }, { value: 'iOS' }], metricValues: [{ value: '2' }, { value: '9' }] },
      { dimensionValues: [{ value: '20261102' }, { value: 'web' }], metricValues: [{ value: '1' }, { value: '1' }] },
    ],
  })
  assert.deepEqual(rows, [
    { date: '2026-11-02', platform: 'android', new_users: 5, active_users: 40 },
    { date: '2026-11-02', platform: 'ios', new_users: 2, active_users: 9 },
  ])
})
