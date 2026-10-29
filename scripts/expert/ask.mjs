// "Uzmana sor" ve "Uzmana öğret": stüdyonun kendi modeli (Ollama) yayın, mağaza kuralları ve oyunların durumu hakkında
// soruları cevaplar. Bildikleri: Android/iOS kuralları, eşikler, Apple ret bilgi tabanı, kullanıcının öğrettikleri ve
// oyunun son build/mağaza raporu. Bilmediğini uydurmasın diye sadece bu bilgiyle konuşur.

import fs from 'node:fs'
import { MODEL } from './llm.mjs'
import androidRules from '../../uzman/kurallar/android.mjs'
import iosRules from '../../uzman/kurallar/ios.mjs'

const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'))

// Kullanıcının öğrettikleri: { id, text, platform: 'android' | 'ios' | 'all', at, by }
export const lessonsOf = async (db) => (await db('app_settings?key=eq.expert_lessons&select=value').catch(() => []))[0]?.value?.items ?? []

// Her build raporuna hatırlatma olarak eklenir (öğrendiğini unutmasın)
export function lessonFindings(lessons, platform) {
  return lessons
    .filter((l) => !l.platform || l.platform === 'all' || l.platform === platform)
    .map((l) => ({ id: `lesson-${l.id}`, severity: 'info', title: 'Öğrettiğin: ' + l.text.split(/[.!?\n]/)[0].slice(0, 80), detail: l.text, fix: [] }))
}

const norm = (s) => String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
const words = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4))

// Soruyla en çok kelime paylaşan bilgiler (küçük model her şeyi okuyunca dağılır; ilgili olanları tam veririz)
export function relevant(question, items, n = 3) {
  const q = words(question)
  return items
    .map((it) => ({ it, score: [...words(it.text)].filter((w) => q.has(w) || [...q].some((x) => x.length >= 5 && (w.startsWith(x.slice(0, 5)) || x.startsWith(w.slice(0, 5))))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.it)
}

// Modelin bağlamı: soruyla ilgili kurallar tam (detay + bütün adımlar), diğerleri sadece başlık
export function knowledge({ question = '', lessons = [], game = null, build = null, aso = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const esik = read('../../uzman/esikler.json')
  const apple = read('../../uzman/apple-kurallar.json').kurallar
  const now = (list) => list.filter((e) => e.from <= today).at(-1)
  const items = [
    ...androidRules.map((r) => ({ head: `Android: ${r.title}`, text: `${r.title} ${r.fix.join(' ')}`, full: `Android kontrolü "${r.title}". Çözüm adımları: ${r.fix.map((s, i) => `${i + 1}) ${s}`).join(' ')}` })),
    ...iosRules.map((r) => ({ head: `iOS: ${r.title}`, text: `${r.title} ${r.fix.join(' ')}`, full: `iOS kontrolü "${r.title}". Çözüm adımları: ${r.fix.map((s, i) => `${i + 1}) ${s}`).join(' ')}` })),
    ...Object.entries(apple).filter(([, v]) => v.baslik).map(([k, v]) => ({ head: `Apple ${k}: ${v.baslik}`, text: `${k} ${v.baslik} ${v.anlam} ${v.yap.join(' ')}`, full: `Apple kuralı ${k} "${v.baslik}": ${v.anlam} Yapılacaklar: ${v.yap.map((s, i) => `${i + 1}) ${s}`).join(' ')}${v.itiraz ? ` İtiraz: ${v.itiraz}` : ''}` })),
  ]
  const top = relevant(question, items)
  const lines = [
    `Bugün: ${today}.`,
    `Google Play hedef API en az ${now(esik.targetSdk)?.min}; 16 KB sayfa uyumu ${now(esik.pageSize16k)?.severity === 'block' ? 'zorunlu' : 'uyarı'}. Apple en az iOS ${now(esik.iosSdk)?.min} SDK (Xcode ${now(esik.iosSdk)?.xcode}).`,
    ...(top.length ? ['Soruyla ilgili bilgiler (cevabı bunlara dayandır):', ...top.map((t) => '- ' + t.full)] : []),
    'Bildiğin diğer konular: ' + items.filter((i) => !top.includes(i)).map((i) => i.head).join('; '),
  ]
  if (lessons.length) lines.push('Stüdyonun öğrendikleri (bunlara özellikle dikkat et): ' + lessons.map((l) => `[${l.platform ?? 'all'}] ${l.text}`).join(' | '))
  if (game) lines.push(`Soru şu oyunla ilgili: ${game.name} (tür: ${game.genre ?? '?'}, platform: ${(game.platforms ?? []).join(', ')}).`)
  if (build) lines.push(`Bu oyunun son build'i: ${build.version_name ?? '?'} (${build.platform}), durum ${build.status}. Bulgular: ${(build.report?.findings ?? []).map((f) => `${f.severity}: ${f.title}`).join('; ') || 'yok'}.${build.report?.device ? ` Cihaz testi: ${build.report.device.outcome}.` : ''}`)
  if (aso?.findings) lines.push(`Play mağaza sayfası: başlık "${aso.listing?.title ?? ''}", ${aso.images?.phone ?? '?'} ekran görüntüsü, video ${aso.listing?.video ? 'var' : 'yok'}. Eksikler: ${aso.findings.map((f) => f.title).join('; ') || 'yok'}.`)
  return lines.join('\n')
}

const SYSTEM = [
  'Sen Voo Game Studio\'nun yayın uzmanısın. Kullanıcı kod bilmeyen bir oyun geliştiricisi; Türkçe, kısa, sıcak ve adım adım cevap ver.',
  'Sadece sana verilen bilgilere dayan. Bilmiyorsan "Bunu kesin bilmiyorum" de ve nereye bakması gerektiğini söyle (Play Console, App Store Connect, Google/Apple yardım sayfası).',
  'Sayı, tarih ya da kural uydurma. Unity menü yollarını (Unity › Player Settings › …) kullan.',
  'Biçim: önce tek cümlede sorunun ne olduğunu söyle, sonra numaralı adımlar (en fazla 6), aynı cümleyi tekrar etme.',
].join(' ')

// Küçük model bazen cümle tekrarlar: aynı cümleyi bir kez bırak
export function dedupe(text) {
  const seen = new Set()
  return text
    .split('\n')
    .map((line) => line.split(/(?<=[.!?])\s+/).filter((s) => {
      const k = norm(s).replace(/[^a-z0-9]/g, '')
      if (k.length < 12) return true
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }).join(' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function answer(question, context, { fetchImpl = fetch, timeoutMs = 300000 } = {}) {
  let timer
  try {
    const res = await Promise.race([
      fetchImpl(`${OLLAMA}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, system: SYSTEM, prompt: `Bilgiler:\n${context}\n\nSoru: ${question}\n\nCevap:`, stream: false, options: { temperature: 0.4, repeat_penalty: 1.2, num_ctx: 8192 } }),
      }),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('zaman aşımı')), timeoutMs))),
    ])
    if (!res.ok) return null
    const out = dedupe(String((await res.json()).response ?? '').trim())
    return out.length >= 20 && out.length <= 4000 ? out : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Kuyruktaki soruyu cevaplar, sohbet geçmişine (son 40) ekler
export async function handleAsk(item, { db, fetchImpl } = {}) {
  const lessons = await lessonsOf(db)
  let game = null
  let build = null
  let aso = null
  if (item.gameId) {
    ;[game] = await db(`games?id=eq.${encodeURIComponent(item.gameId)}&select=id,name,genre,platforms`).catch(() => [])
    ;[build] = await db(`store_builds?game_id=eq.${encodeURIComponent(item.gameId)}&select=version_name,platform,status,report&order=created_at.desc&limit=1`).catch(() => [])
    aso = (await db(`app_settings?key=eq.aso:${encodeURIComponent(item.gameId)}&select=value`).catch(() => []))[0]?.value ?? null
  }
  const a = await answer(item.text, knowledge({ question: item.text, lessons, game, build, aso }), { fetchImpl })
  const entry = { id: item.id, q: item.text, a: a ?? 'Şu an cevap yazamadım (model açılamadı). Biraz sonra tekrar sor.', ai: Boolean(a), gameId: item.gameId ?? null, by: item.by, at: new Date().toISOString() }
  const prev = (await db('app_settings?key=eq.expert_chat&select=value').catch(() => []))[0]?.value?.items ?? []
  await db('app_settings?on_conflict=key', 'POST', [{ key: 'expert_chat', value: { items: [entry, ...prev].slice(0, 40) }, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal')
  return entry
}
