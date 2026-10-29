import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changes, draftReply, explain, guidelinesIn, syncReviews } from './appreview.mjs'

const msg = `Guideline 5.1.1(v) - Legal - Privacy - Data Collection and Storage
Issue Description: The app supports account creation but does not include an option to initiate account deletion.
Guideline 2.1 - Performance - App Completeness
We found that your app crashed on iPad Air (5th generation) running iPadOS 18.1.`

test('ret mesajından kural numaraları çıkar', () => {
  assert.deepEqual(guidelinesIn(msg), ['5.1.1(v)', '2.1'])
})

test('kural bilgi tabanından Türkçe açıklama; bilinmeyen ayrı', () => {
  const { known, unknown } = explain(['5.1.1(v)', '2.1(a)', '9.9'])
  assert.equal(known[0].title, 'Hesap silme seçeneği yok')
  assert.equal(known[1].title, 'Uygulama tamlığı (çökme, eksik içerik, demo hesap)') // 2.1(a) → 2.1'e yönlenir
  assert.deepEqual(unknown, ['9.9'])
})

test('durum değişimi bildirimi; ilk kayıtta eski yayın için bildirim yok', () => {
  const cur = { 1: { gameId: 's', name: 'Salgın', version: '1.1', state: 'IN_REVIEW' }, 2: { gameId: 'b', name: 'Borsa', version: '2.0', state: 'READY_FOR_SALE' } }
  const n = changes({}, cur)
  assert.deepEqual(n.map((x) => x.title), ['Salgın 1.1 Apple şu an inceliyor'])
  assert.deepEqual(changes(cur, cur), [])
  assert.match(changes(cur, { ...cur, 1: { ...cur[1], state: 'REJECTED' } })[0].title, /reddedildi/)
})

test('model cevabı İngilizce değilse ya da kural numarası yoksa şablon kullanılır', async () => {
  const model = (response) => async () => ({ ok: true, json: async () => ({ response }) })
  const tr = await draftReply({ text: msg, ids: ['2.1'], fixes: 'hesap silme ekledik' }, { fetchImpl: model('Merhaba, hesabı silme özelliğini ekledik ve düzelttik. '.repeat(8)) })
  assert.equal(tr.ai, false)
  assert.match(tr.reply, /^Hello App Review Team,/)
  const good = 'Hello App Review Team,\n\nThank you for the review. Regarding Guideline 2.1, we have fixed the crash on iPad and our team tested the update on several devices. We have uploaded a new build.\n\nBest regards,\nVoo Game Studio'
  const en = await draftReply({ text: msg, ids: ['2.1'], fixes: '' }, { fetchImpl: model(good) })
  assert.deepEqual(en, { reply: good, ai: true })
})

test('senkron: durumu kaydeder, değişince bildirir', async () => {
  const saved = []
  const notes = []
  const db = async (p, m, body) => {
    if (p.startsWith('games?')) return [{ id: 'salgin', name: 'Salgın', ios_app_id: '123' }]
    if (p.startsWith('app_settings?key=eq.asc_review_state')) return [{ value: { apps: { 123: { version: '1.1', state: 'WAITING_FOR_REVIEW', since: 'x' } } } }]
    if (m === 'POST') saved.push(body)
    return null
  }
  const ascApi = async () => ({ data: [{ id: 'v1', attributes: { versionString: '1.1', appVersionState: 'PENDING_DEVELOPER_RELEASE', createdDate: '2026-10-28' } }] })
  const n = await syncReviews({ db, ascApi, notify: async (...a) => notes.push(a) })
  assert.equal(n, 1)
  assert.match(notes[0][1], /Salgın 1\.1 onaylandı/)
  assert.equal(saved[0][0].value.apps['123'].state, 'PENDING_DEVELOPER_RELEASE')
})
