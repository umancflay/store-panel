import test from 'node:test'
import assert from 'node:assert/strict'
import { changes, iosRank, parseRival, pkgOf, playRank, pushSnap } from './ranks.mjs'

test('paket adı linkten ya da düz yazıdan çıkar', () => {
  assert.equal(pkgOf('https://play.google.com/store/apps/details?id=com.a.b&hl=tr'), 'com.a.b')
  assert.equal(pkgOf(' com.a.b '), 'com.a.b')
  assert.equal(pkgOf('moving game'), null)
})

test('Play ve App Store sırası', () => {
  const html = '<a href="/store/apps/details?id=x.one"></a><a href="/store/apps/details?id=x.one"></a><a href="/store/apps/details?id=x.two"></a>'
  assert.equal(playRank(html, 'x.two'), 2)
  assert.equal(playRank(html, 'x.three'), null)
  assert.equal(iosRank({ results: [{ trackId: 5 }, { trackId: 9 }] }, '9'), 2)
  assert.equal(iosRank({ results: [] }, '9'), null)
})

test('rakip sayfası okunur', () => {
  const html = '<meta property="og:title" content="Box &amp; Move - Apps on Google Play"><img src="https://play-lh.googleusercontent.com/abc=s48" class="x" alt="Icon image">'
    + '<div aria-label="Rated 4.3 stars out of five stars"></div><div>12.5K reviews</div>["1,000,000+",1000000,1834567,"1M+"]'
    + '<div>Updated on</div><div class="xg1aie">Oct 29, 2026</div>'
  assert.deepEqual(parseRival(html), { title: 'Box & Move', icon: 'https://play-lh.googleusercontent.com/abc', rating: 4.3, reviews: '12.5K', installs: 1834567, installsLabel: '1M+', updated: '2026-10-29' })
})

test('günlük kayıt: aynı gün üzerine yazılır, en fazla N gün', () => {
  const l = pushSnap([{ d: '2026-11-01', play: 5 }, { d: '2026-11-02', play: 4 }], { d: '2026-11-02', play: 3 }, 2)
  assert.deepEqual(l, [{ d: '2026-11-01', play: 5 }, { d: '2026-11-02', play: 3 }])
  assert.equal(pushSnap(l, { d: '2026-11-03' }, 2)[0].d, '2026-11-02')
})

test('bildirim: ilk 10 giriş/çıkış ve rakip güncellemesi', () => {
  const prev = { keywords: { box: { snaps: [{ d: '1', play: 14, ios: 3 }] } }, rivals: { r: { title: 'R', updated: '2026-10-01' } } }
  const next = { keywords: { box: { snaps: [{ d: '2', play: 8, ios: null }] } }, rivals: { r: { title: 'R', updated: '2026-11-01' } } }
  assert.deepEqual(changes('Haul', prev, next), [
    'Haul: "box" Play\'de ilk 10\'a girdi (8.)',
    'Haul: "box" App Store\'de ilk 10\'dan çıktı (30+.)',
    'Rakip güncelledi: R (Haul rakibi)',
  ])
})
