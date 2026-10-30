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
