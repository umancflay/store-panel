import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROMO, asoRules, parseSearch, parseStorePage, suggest, whatsNew } from './aso.mjs'

const page = `<meta property="og:title" content="Idle Miner Tycoon: Gold &amp; Cash - Apps on Google Play">
<img data-screenshot-index="0"><img data-screenshot-index="7">
<iframe src="https://www.youtube.com/embed/abc"></iframe>
["100,000,000+",100000000,176264268,"100M+"]
<div class="bARER" data-g-id="description" inert>Are you a true gold miner?<br>Build your empire.</div>`

test('rakip sayfasından başlık, görsel, video, indirme okunur', () => {
  const p = parseStorePage(page, 'x')
  assert.equal(p.title, 'Idle Miner Tycoon: Gold & Cash')
  assert.equal(p.screenshots, 8)
  assert.equal(p.video, true)
  assert.equal(p.installs, 176264268)
  assert.match(p.intro, /^Are you a true gold miner\?\nBuild/)
})

test('arama sonuçları sırayla, tekrarsız ve kendi oyunun hariç', () => {
  const html = 'details?id=a.b x /store/apps/details?id=c.d /store/apps/details?id=a.b /store/apps/details?id=me.game /store/apps/details?id=e.f'
  assert.deepEqual(parseSearch(html, ['me.game']), ['c.d', 'a.b', 'e.f'])
})

test('iddia kelimeleri ve emoji yakalanır', () => {
  assert.ok(PROMO.test('Best Zombie Game'))
  assert.ok(PROMO.test('Salgın 🔥'))
  assert.ok(PROMO.test('Ücretsiz Oyun'))
  assert.ok(!PROMO.test('Salgın: Zombi Hayatta Kalma'))
})

test('kurallar: yasak başlık, az görsel, öne çıkan görsel yok, video yok, eksik dil', () => {
  const f = asoRules({
    listing: { title: 'Best Game', shortDescription: 'kısa', fullDescription: 'x'.repeat(300) },
    images: { phone: 2, tablet7: 0, tablet10: 0, feature: 0 },
    competitors: [{ screenshots: 8, descLength: 3000, video: true }, { screenshots: 8, descLength: 3500, video: true }],
    languages: ['en-US'], topCountries: [{ lang: 'tr', name: 'Türkçe' }],
  })
  const ids = f.map((x) => x.id)
  for (const id of ['title-promo', 'title-short', 'short-weak', 'full-short', 'few-shots', 'no-feature', 'no-video', 'no-tablet', 'languages']) assert.ok(ids.includes(id), id)
  assert.equal(f[0].severity, 'block')
})

test('iyi sayfada uyarı çıkmaz', () => {
  const f = asoRules({
    listing: { title: 'Salgın: Zombi Hayatta Kalma', shortDescription: 'Zombilerle dolu bir şehirde hayatta kal, üssünü kur ve ekibini büyüt!', fullDescription: 'x'.repeat(2500), video: 'https://youtu.be/x' },
    images: { phone: 8, tablet7: 4, tablet10: 4, feature: 1 },
    competitors: [{ screenshots: 8, descLength: 3000, video: true }],
    languages: ['tr-TR', 'en-US'], topCountries: [{ lang: 'tr', name: 'Türkçe' }],
  })
  assert.deepEqual(f, [])
})

const fakeModel = (response) => async () => ({ ok: true, json: async () => ({ response: JSON.stringify(response) }) })

test('model önerilerinden sınırı aşan ve iddialı olanlar atılır', async () => {
  const s = await suggest({
    listing: { title: 'Salgın' }, rivals: [], language: 'tr-TR',
    fetchImpl: fakeModel({ titles: ['Salgın: Zombi Hayatta Kalma', 'Salgın: En İyi Zombi Oyunu', 'x'.repeat(31)], shorts: ['Zombilerle dolu şehirde hayatta kal'], intro: 'Giriş.' }),
  })
  assert.deepEqual(s.titles, ['Salgın: Zombi Hayatta Kalma'])
  assert.equal(s.shorts.length, 1)
})

test('sürüm notu: model yoksa maddeler kullanılır', async () => {
  const n = await whatsNew('- Yeni bölüm\n- Hata düzeltmeleri', { fetchImpl: async () => { throw new Error('yok') } })
  assert.equal(n.tr, '• Yeni bölüm\n• Hata düzeltmeleri')
  assert.equal(n.ai, false)
})

test('sürüm notu: model TR ve EN yazar', async () => {
  const n = await whatsNew('Yeni bölüm', { fetchImpl: fakeModel({ tr: '• Yeni bölüm eklendi!', en: '• New chapter added!' }) })
  assert.deepEqual(n, { tr: '• Yeni bölüm eklendi!', en: '• New chapter added!', ai: true })
})
