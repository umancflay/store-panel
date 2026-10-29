import { test } from 'node:test'
import assert from 'node:assert/strict'
import { polish, validatePolish } from './llm.mjs'

const findings = [
  { id: 'debuggable', severity: 'block', title: 'Hata ayıklama (debug) açık', detail: 'Build "debuggable" işaretli.', fix: ['Development Build kutusunu kaldır.'] },
  { id: 'big-download', severity: 'warn', title: 'İndirme boyutu çok büyük', detail: 'Dosya 250 MB. Sınır 200 MB.', fix: ['Asset Delivery kullan.'] },
]
const report = { text: 'Salgın 1.1.0 (42) · Yüklenemez: 1 engelleyici sorun\n...' }
const good =
  'Bu sürüm şu an yüklenemez. Önce hata ayıklama ayarını kapatman gerekiyor: Unity Build Settings ekranında Development Build kutusunu kaldır ve build\'i yeniden al. ' +
  'Ayrıca dosya 250 MB, sınır 200 MB; büyük içerikleri ayırırsan daha çok indirilir.'

const fakeFetch = (response) => async () => new Response(JSON.stringify({ response }), { status: 200 })

test('polish: iyi çıktı → metin', async () => {
  assert.equal(await polish(report, findings, { fetchImpl: fakeFetch(good) }), good)
})

test('polish: girdide olmayan sayı → null', async () => {
  assert.equal(await polish(report, findings, { fetchImpl: fakeFetch(good + ' Oyuncuların %87\'si etkilenir.') }), null)
})

test('polish: model hatası ya da zaman aşımı → null', async () => {
  assert.equal(await polish(report, findings, { fetchImpl: async () => { throw new Error('bağlantı yok') } }), null)
  const slow = () => new Promise(() => {})
  assert.equal(await polish(report, findings, { fetchImpl: slow, timeoutMs: 20 }), null)
})

test('validatePolish: engelleyici bulgudan söz etmeyen çıktı geçmez', () => {
  assert.equal(validatePolish('Her şey çok güzel görünüyor, sadece dosya büyük; 250 MB, sınır 200 MB, biraz küçültmek iyi olur dostum.', findings), false)
  assert.equal(validatePolish('kısa', findings), false)
  assert.equal(validatePolish(good, findings), true)
})
