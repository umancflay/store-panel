// App Store incelemesi: oyunların iOS sürüm durumunu birkaç dakikada bir izler, her değişimde telefona haber verir;
// ret gelince kullanıcının yapıştırdığı Apple mesajını kural numarasına göre Türkçe açıklar ve İngilizce cevap taslağı yazar.

import fs from 'node:fs'
import { MODEL } from './llm.mjs'

const KB = JSON.parse(fs.readFileSync(new URL('../../uzman/apple-kurallar.json', import.meta.url), 'utf8'))
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

// Durum değişince giden bildirim (yoksa sessiz)
export const STATE_NEWS = {
  WAITING_FOR_REVIEW: ['incelemeye gönderildi', 'Apple sırasında; genelde 24–48 saat içinde bakılır.'],
  IN_REVIEW: ['Apple şu an inceliyor', 'Genelde birkaç saat sürer.'],
  PENDING_DEVELOPER_RELEASE: ['onaylandı! 🎉', 'Yayına almak için App Store Connect\'te "Bu sürümü yayınla"ya bas.'],
  PENDING_APPLE_RELEASE: ['onaylandı 🎉', 'Apple birazdan yayına alacak.'],
  READY_FOR_SALE: ['App Store\'da yayında 🎉', 'Oyuncular indirebilir.'],
  READY_FOR_DISTRIBUTION: ['App Store\'da yayında 🎉', 'Oyuncular indirebilir.'],
  REJECTED: ['reddedildi', 'Apple\'ın mesajını panele (Yayın Uzmanı › App Store) yapıştır; ne demek ve ne yapacağını söyleyip cevabı yazayım.'],
  METADATA_REJECTED: ['bilgileri reddedildi', 'Build sorun değil, mağaza bilgileri. Apple\'ın mesajını panele yapıştır.'],
  INVALID_BINARY: ['build\'i geçersiz sayıldı', 'Apple\'ın e-postasındaki ITMS kodunu panele yapıştır.'],
}

// Her oyunun son iOS sürümü: { appId: { gameId, name, version, state, versionId } }
export async function currentStates(ascApi, games) {
  const out = {}
  for (const g of games.filter((x) => x.ios_app_id)) {
    const { data = [] } = (await ascApi(`/apps/${g.ios_app_id}/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appVersionState,appStoreState,createdDate`, { allow404: true })) ?? {}
    const v = data.sort((a, b) => (b.attributes.createdDate ?? '').localeCompare(a.attributes.createdDate ?? ''))[0]
    if (v) out[g.ios_app_id] = { gameId: g.id, name: g.name, version: v.attributes.versionString, state: v.attributes.appVersionState ?? v.attributes.appStoreState, versionId: v.id }
  }
  return out
}

// Önceki kayıtla karşılaştırır, değişenler için bildirim döndürür
export function changes(prev, cur) {
  const news = []
  for (const [appId, c] of Object.entries(cur)) {
    const p = prev?.[appId]
    if (p && p.version === c.version && p.state === c.state) continue
    if (!p && !['WAITING_FOR_REVIEW', 'IN_REVIEW', 'REJECTED', 'METADATA_REJECTED'].includes(c.state)) continue // ilk kayıtta eski durumlar için bildirim yok
    const n = STATE_NEWS[c.state]
    if (n) news.push({ appId, gameId: c.gameId, title: `${c.name} ${c.version} ${n[0]}`, body: n[1], state: c.state })
  }
  return news
}

// Panelden ve inceleme işinden çağrılır: durumları kaydeder, değişimleri bildirir
export async function syncReviews({ db, ascApi, notify }) {
  const games = await db('games?select=id,name,ios_app_id&ios_app_id=not.is.null&active=eq.true')
  if (!games.length) return 0
  const [row] = await db('app_settings?key=eq.asc_review_state&select=value')
  const prev = row?.value?.apps ?? null
  const cur = await currentStates(ascApi, games)
  const news = changes(prev ?? {}, cur)
  for (const n of news) await notify(null, n.title, n.body, './#/yayin?tab=appstore')
  const stamped = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, { ...v, since: prev?.[k]?.state === v.state && prev?.[k]?.version === v.version ? prev[k].since : new Date().toISOString() }]))
  await db('app_settings?on_conflict=key', 'POST', [{ key: 'asc_review_state', value: { at: new Date().toISOString(), apps: stamped }, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal')
  return news.length
}

// Ret mesajından kural numaraları: "Guideline 5.1.1(v) - Legal - Privacy", "Guideline 2.1 - Performance"
export function guidelinesIn(text) {
  const ids = [...String(text).matchAll(/Guideline\s+(\d+(?:\.\d+)*(?:\s?\([a-z]+\))?)/gi)].map((m) => m[1].replace(/\s/g, ''))
  return [...new Set(ids)]
}

export function explain(ids) {
  const known = []
  const unknown = []
  for (const id of ids) {
    let k = KB.kurallar[id] ?? KB.kurallar[id.replace(/\([a-z]+\)$/, '')] ?? KB.kurallar[id.split('.').slice(0, 2).join('.')]
    if (k?.ref) k = KB.kurallar[k.ref]
    if (k) known.push({ id, title: k.baslik, meaning: k.anlam, fix: k.yap, appeal: k.itiraz || null })
    else unknown.push(id)
  }
  return { known, unknown }
}

const englishish = (s) => /\b(the|we|our|app|have|update|thank)\b/i.test(s) && !/[ğışçöüĞİŞÇÖÜ]/.test(s)

// Resolution Center'a İngilizce cevap taslağı. Model yoksa şablon.
export async function draftReply({ text, ids, fixes, appeal }, { fetchImpl = fetch, timeoutMs = 300000 } = {}) {
  const template = [
    'Hello App Review Team,',
    '',
    `Thank you for your feedback regarding ${ids.length ? `Guideline ${ids.join(', ')}` : 'our submission'}.`,
    fixes ? `We have made the following changes: ${fixes}` : 'We have addressed the issue you described and uploaded a new build.',
    'Please let us know if you need any further information.',
    '',
    'Best regards,',
    'Voo Game Studio',
  ].join('\n')
  let timer
  try {
    const res = await Promise.race([
      fetchImpl(`${OLLAMA}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, stream: false, options: { temperature: 0.3, num_ctx: 8192 },
          system: 'You write short, polite, factual replies to Apple App Review in English for a small game studio (Voo Game Studio). Never promise things not listed. No marketing language.',
          prompt: [
            'Apple\'s rejection message:', String(text).slice(0, 4000), '',
            `What the developer did / will do (may be in Turkish, translate): ${fixes || 'fixed the issue and uploaded a new build'}`,
            appeal ? 'The developer believes the rejection is a misunderstanding; explain politely and ask them to re-review.' : '',
            'Write the reply (120–220 words), plain text, starting with "Hello App Review Team,".',
          ].join('\n'),
        }),
      }),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('zaman aşımı')), timeoutMs))),
    ])
    if (!res.ok) return { reply: template, ai: false }
    const out = String((await res.json()).response ?? '').trim()
    const ok = out.length >= 200 && out.length <= 2500 && englishish(out) && ids.every((id) => out.includes(id.split('(')[0]))
    return ok ? { reply: out, ai: true } : { reply: template, ai: false }
  } catch {
    return { reply: template, ai: false }
  } finally {
    clearTimeout(timer)
  }
}

export async function handleRejection(item, deps = {}) {
  const ids = guidelinesIn(item.text)
  const { known, unknown } = explain(ids)
  const { reply, ai } = await draftReply({ text: item.text, ids, fixes: item.fixes ?? '', appeal: Boolean(item.appeal) }, deps)
  return { at: new Date().toISOString(), text: item.text, ids, known, unknown, reply, ai }
}
