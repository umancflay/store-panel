import test from 'node:test'
import assert from 'node:assert/strict'
import { clampShots, segmentArgs, wrapText } from './studio.mjs'

test('wrapText satırlara böler', () => {
  assert.equal(wrapText('Bu seviyeyi geçebilir misin acaba', 18), 'Bu seviyeyi\ngeçebilir misin\nacaba')
  assert.equal(wrapText(''), '')
})

test('clampShots süreleri 1-8 sn ve toplam 30 sn ile sınırlar', () => {
  const s = clampShots([{ seconds: 20 }, { seconds: 0 }, { seconds: 8 }, { seconds: 8 }, { seconds: 8 }, { seconds: 8 }, { seconds: 3 }])
  assert.equal(s.length, 6)
  assert.deepEqual(s.map((x) => x.seconds), [8, 3, 8, 8, 3, 1])
})

test('segmentArgs resim için döngü, yazı için drawtext ekler', () => {
  const a = segmentArgs({ input: 'a.png', isImage: true, seconds: 3, textFile: 't.txt', out: 'o.mp4', font: 'C:\\Windows\\Fonts\\arial.ttf' })
  assert.equal(a[1], '-loop')
  const vf = a[a.indexOf('-vf') + 1]
  assert.match(vf, /crop=1080:1920/)
  assert.ok(vf.includes("fontfile='C\\:/Windows/Fonts/arial.ttf'"))
  const v = segmentArgs({ input: 'a.mp4', isImage: false, seconds: 3, out: 'o.mp4' })
  assert.ok(!v.includes('-loop'))
  assert.ok(!v[v.indexOf('-vf') + 1].includes('drawtext'))
})

test('muxArgs müzik varsa kırpar ve sonda yumuşatır, yoksa sessiz kanal ekler', async () => {
  const { muxArgs } = await import('./studio.mjs')
  const m = muxArgs({ list: 'l.txt', music: 'm.mp3', seconds: 10, out: 'o.mp4' })
  assert.ok(m.includes('-stream_loop'))
  assert.match(m[m.indexOf('-filter_complex') + 1], /atrim=0:10.*afade=t=out:st=8.80/)
  const s = muxArgs({ list: 'l.txt', music: null, seconds: 10, out: 'o.mp4' })
  assert.ok(s.join(' ').includes('anullsrc'))
})
