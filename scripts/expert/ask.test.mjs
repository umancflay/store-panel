import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupe, handleAsk, knowledge, lessonFindings } from './ask.mjs'

const lessons = [
  { id: 'a', text: 'Play, oyun içi satın alma ekran görüntüsü olmadan reddetti. Her IAP ürününe görsel ekle.', platform: 'android' },
  { id: 'b', text: 'Apple demo hesap istedi.', platform: 'ios' },
  { id: 'c', text: 'Her sürümde gizlilik politikası linkini kontrol et.', platform: 'all' },
]

test('öğrettiklerin platforma göre build raporuna hatırlatma olur', () => {
  const f = lessonFindings(lessons, 'android')
  assert.deepEqual(f.map((x) => x.id), ['lesson-a', 'lesson-c'])
  assert.equal(f[0].severity, 'info')
  assert.equal(f[0].title, 'Öğrettiğin: Play, oyun içi satın alma ekran görüntüsü olmadan reddetti')
})

test('bilgi paketinde eşikler, kurallar, öğrettiklerin ve oyunun durumu var', () => {
  const k = knowledge({ lessons, game: { name: 'Salgın', genre: 'strateji', platforms: ['android'] }, build: { version_name: '1.1', platform: 'android', status: 'blocked', report: { findings: [{ severity: 'block', title: 'Test reklam kimliği unutulmuş' }] } }, today: '2026-10-29' })
  assert.match(k, /hedef API en az 36/)
  assert.match(k, /Test reklam kimliği unutulmuş/)
  assert.match(k, /demo hesap/)
  assert.match(k, /Salgın/)
  assert.match(k, /5\.1\.1/)
})

test('soru cevaplanır ve sohbet geçmişinin başına eklenir; model yoksa nazik mesaj', async () => {
  const saved = []
  const db = async (p, m, body) => {
    if (p.startsWith('app_settings?key=eq.expert_lessons')) return [{ value: { items: lessons } }]
    if (p.startsWith('app_settings?key=eq.expert_chat')) return [{ value: { items: [{ id: 'old', q: 'eski', a: 'eski cevap' }] } }]
    if (m === 'POST') saved.push(body)
    return []
  }
  const ok = await handleAsk({ id: 'n', text: 'Hedef API kaç olmalı?', by: 'u' }, { db, fetchImpl: async () => ({ ok: true, json: async () => ({ response: 'Hedef API en az 35 olmalı. Unity › Player Settings › Target API Level.' }) }) })
  assert.equal(ok.ai, true)
  assert.deepEqual(saved[0][0].value.items.map((x) => x.id), ['n', 'old'])
  const fail = await handleAsk({ id: 'm', text: 'x?', by: 'u' }, { db, fetchImpl: async () => { throw new Error('yok') } })
  assert.equal(fail.ai, false)
  assert.match(fail.a, /cevap yazamadım/)
})

test('soruyla ilgili kural tam adımlarıyla bağlama girer', () => {
  const k = knowledge({ question: 'Build\'imde test reklam kimliği çıktı, nasıl düzeltirim?', today: '2026-10-29' })
  const rel = k.split('Bildiğin diğer konular')[0]
  assert.match(rel, /Test reklam kimliği unutulmuş/)
  assert.match(rel, /2\) Hepsini AdMob/)
})

test('tekrarlanan cümle bir kez kalır', () => {
  assert.equal(dedupe('Kimlikleri ara. Bunu yaptıktan sonra değiştir. Kimlikleri ara.'), 'Kimlikleri ara. Bunu yaptıktan sonra değiştir.')
})
