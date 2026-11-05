import test from 'node:test'
import assert from 'node:assert/strict'
import { genreShare, parseFeed, parseHints, withChange } from './charts.mjs'

test('App Store listesi okunur', () => {
  const json = { feed: { entry: [{ id: { attributes: { 'im:id': '7' } }, 'im:name': { label: 'Oyun' }, 'im:artist': { label: 'Stüdyo' }, 'im:image': [{ label: 'a' }, { label: 'b' }] }, { id: {} }] } }
  assert.deepEqual(parseFeed(json), [{ id: '7', name: 'Oyun', artist: 'Stüdyo', icon: 'b' }])
  assert.deepEqual(parseFeed({}), [])
})

test('dünkü listeye göre değişim, ilk gün değişim yok', () => {
  const l = withChange([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])
  assert.deepEqual(l, [{ id: 'a', prev: null }, { id: 'b', prev: 1 }])
  assert.equal(withChange([{ id: 'a' }])[0].prev, undefined)
})

test('türler sayılır, Games sayılmaz', () => {
  assert.deepEqual(genreShare([{ genres: ['Games', 'Puzzle'] }, { genres: ['Games', 'Puzzle', 'Casual'] }]), [['Puzzle', 2], ['Casual', 1]])
})

test('arama önerileri plistten çıkar', () => {
  const xml = '<dict><key>term</key>\n<string>moving games</string></dict><dict><key>term</key><string>box &amp; move</string></dict>'
  assert.deepEqual(parseHints(xml), ['moving games', 'box & move'])
})
