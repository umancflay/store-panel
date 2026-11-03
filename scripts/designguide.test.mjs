import test from 'node:test'
import assert from 'node:assert/strict'
import { iconUrl, screenshotUrls } from './designguide.mjs'

test('Play sayfasından ekran görüntüsü ve ikon bağlantıları çıkar', () => {
  const html = `<meta property="og:image" content="https://play-lh.googleusercontent.com/ICON=w240">
<img src="https://play-lh.googleusercontent.com/AAA=w526-h296" srcset="x 2x" alt="Screenshot image" data-screenshot-index="0">
<img src="https://play-lh.googleusercontent.com/BBB=w526-h296" alt="Screenshot image" data-screenshot-index="1">
<img src="https://play-lh.googleusercontent.com/AAA=w526-h296" alt="Screenshot image">
<img src="https://play-lh.googleusercontent.com/CCC=w64" alt="Icon image">`
  assert.deepEqual(screenshotUrls(html), ['https://play-lh.googleusercontent.com/AAA', 'https://play-lh.googleusercontent.com/BBB'])
  assert.equal(iconUrl(html), 'https://play-lh.googleusercontent.com/ICON')
})

test('görsel boyutu PNG/JPEG başlığından okunur, oyun yönü çoğunluktan çıkar', async () => {
  const { imageSize, orientationOf } = await import('./designguide.mjs')
  const png = Buffer.alloc(32)
  png.writeUInt32BE(0x89504e47, 0)
  png.writeUInt32BE(1920, 16)
  png.writeUInt32BE(1080, 20)
  assert.deepEqual(imageSize(png), { w: 1920, h: 1080 })
  // en küçük JPEG: SOI + SOF0 (yükseklik 720, genişlik 1280)
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(imageSize(jpg), { w: 1280, h: 720 })
  assert.equal(orientationOf(undefined, [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }, { w: 1600, h: 900 }]), 'yatay')
  assert.equal(orientationOf('dikey', [{ w: 1920, h: 1080 }]), 'dikey')
  assert.equal(orientationOf(undefined, [null]), null)
})
