// Claude'a atanan görevler (assignee = 'assistant'): mağaza açıklaması, yorum cevabı taslağı, özet, analiz gibi metin işleri.
// Claude sonucu göreve yorum olarak yazar ve görevi açan kişiye "gözden geçir" diye geri atar (telefonuna bildirim gider).
// Mağazaya, reklam hesabına ya da başka bir yere hiçbir şey göndermez; sadece taslak hazırlar.

import { db, setConnection } from './db.mjs'
import { metrics, parse, runClaude } from './ai.mjs'

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const cut = (s, n) => (s ?? '').toString().slice(0, n)

async function maybe(path) {
  try {
    return await db(path)
  } catch {
    return []
  }
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'result', 'summary'],
        properties: { id: { type: 'number' }, result: { type: 'string' }, summary: { type: 'string' } },
      },
    },
  },
}

const PENDING = 'tasks?assignee=eq.assistant&status=eq.open&select=id,title,notes,game_id,subtasks,created_by,history,level,tags&order=created_at&limit=3'

export async function hasAssistantTasks() {
  return (await maybe(PENDING)).length > 0
}

export async function runAssistantTasks() {
  const tasks = await maybe(PENDING)
  if (!tasks.length) return []
  const now = () => new Date().toISOString()
  // Aynı görev iki çalışmada birden alınmasın
  for (const t of tasks) {
    await db(`tasks?id=eq.${t.id}`, 'PATCH', { status: 'doing', history: [...(t.history ?? []), { what: 'Claude üzerinde çalışıyor', at: now() }], updated_at: now() }, 'return=minimal')
  }

  const games = await db('games?select=id,name,genre,android_package,ios_app_id&active=eq.true&hidden=is.false')
  const ids = [...new Set(tasks.map((t) => t.game_id).filter(Boolean))]
  const reviews = ids.length
    ? await maybe(`reviews?game_id=in.(${ids.join(',')})&created_at=gte.${day(60)}&select=game_id,rating,language,title,body,store_reply&order=created_at.desc&limit=60`)
    : []
  const playLang = {}
  for (const id of ids) {
    try {
      const s = await db('rpc/play_breakdown_summary', 'POST', { p_game: id, p_from: day(30) })
      playLang[id] = {
        diller: s.filter((r) => r.dimension === 'language').slice(0, 6).map((r) => ({ dil: r.key, kurulum: Number(r.installs) })),
        ulkeler: s.filter((r) => r.dimension === 'country').slice(0, 6).map((r) => ({ ulke: r.key, kurulum: Number(r.installs) })),
      }
    } catch {
      /* Play verisi yoksa geç */
    }
  }

  const ctx = {
    gorevler: tasks.map((t) => ({
      id: t.id, baslik: t.title, aciklama: cut(t.notes, 1500), oncelik: t.level,
      adimlar: (t.subtasks ?? []).map((s) => s.title), game_id: t.game_id,
    })),
    oyunlar: games.map((g) => ({ game_id: g.id, oyun: g.name, tur: g.genre, android: Boolean(g.android_package), ios: Boolean(g.ios_app_id) })),
    metrikler: await metrics(games.filter((g) => ids.includes(g.id))),
    yorumlar: reviews.map((r) => ({ game_id: r.game_id, puan: r.rating, dil: r.language, baslik: cut(r.title, 100), metin: cut(r.body, 400), cevaplandi: Boolean(r.store_reply) })),
    play_oyunculari: playLang,
  }

  const prompt = [
    `Bugün: ${new Date().toISOString().slice(0, 10)}. Küçük bir mobil oyun stüdyosunda sana atanan görevleri yap.`,
    '"gorevler" listesindeki HER görev için:',
    '- result: İşin kendisi, kullanıma hazır. Ör. mağaza açıklaması istenmişse açıklamanın tamamı (gerekirse oyuncuların en çok konuştuğu dillerde ayrı ayrı);',
    '  yorum cevapları istenmişse her yoruma ayrı taslak; özet/analiz istenmişse maddeler halinde, rakamlarla. Düz metin, başlıklar için satır başı kullan, en fazla ~3000 karakter.',
    '- summary: Tek cümle: ne hazırladın, insanın ne yapması gerekiyor (ör. "Açıklama hazır, Play Console › Mağaza girişi\'ne yapıştırman yeterli").',
    'Hiçbir şeyi yayınlayamaz, gönderemez, para harcayamazsın: sadece taslak yazarsın. Veride olmayan rakam uydurma; bilgi eksikse eksik olanı summary\'de söyle.',
    '',
    'Veri (JSON):',
    JSON.stringify(ctx),
  ].join('\n')

  let result
  try {
    result = parse(await runClaude(prompt, SCHEMA))
  } catch (err) {
    // Görevleri geri bırak; bir sonraki çalışmada tekrar denenir
    for (const t of tasks) await db(`tasks?id=eq.${t.id}`, 'PATCH', { status: 'open', updated_at: now() }, 'return=minimal')
    await setConnection('claude', 'error', `Görevler: ${String(err.message).slice(0, 280)}`)
    throw err
  }

  const people = await maybe('admins?select=email')
  const done = []
  for (const t of tasks) {
    const r = (result.results ?? []).find((x) => x.id === t.id)
    if (!r?.result?.trim()) {
      await db(`tasks?id=eq.${t.id}`, 'PATCH', { status: 'open', updated_at: now() }, 'return=minimal')
      continue
    }
    await db('comments', 'POST', { task_id: t.id, author: 'assistant', body: cut(r.result, 6000) }, 'return=minimal')
    // Görevi açana geri ver (yoksa ekipten ilk kişiye); atama tetikleyicisi telefona "Sana görev atandı" yollar
    const back = t.created_by && t.created_by !== 'assistant' ? t.created_by : people[0]?.email ?? null
    await db(`tasks?id=eq.${t.id}`, 'PATCH', {
      status: 'open',
      assignee: back,
      advice: cut(r.summary, 1000),
      tags: [...new Set([...(t.tags ?? []), 'Claude taslağı'])],
      history: [...(t.history ?? []), { what: 'Claude taslağı hazırladı, gözden geçir', at: now() }],
      updated_at: now(),
    }, 'return=minimal')
    done.push({ id: t.id, title: t.title, back })
  }
  await setConnection('claude', 'connected', `${done.length} görev taslağı hazırlandı`)
  console.log(`Claude görevleri: ${done.length}/${tasks.length}`)
  return done
}
