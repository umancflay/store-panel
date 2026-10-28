// Claude'un haftalık iş bölümü: açık işlere, uyarılara, yorumlara, reklam planına ve kimin son 30 günde
// ne yaptığına bakıp haftanın işlerini ikiye böler. Sadece öneri yazar (work_suggestions); panelde
// "Kabul et" denmeden görev açılmaz, sorumlu değişmez.
// Pazartesi sabahı, son plan 7 günden eskiyse günlük işte ya da panelden "Haftayı planla" denince çalışır.

import { db, setConnection } from './db.mjs'
import { metrics, parse, runClaude } from './ai.mjs'
import { notifyPeople } from './push.mjs'

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
  required: ['week_summary', 'focus', 'suggestions'],
  properties: {
    week_summary: { type: 'string' },
    focus: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'summary'],
        properties: { email: { type: 'string' }, summary: { type: 'string' } },
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'level', 'assignee', 'why'],
        properties: {
          kind: { type: 'string', enum: ['new_task', 'assign'] },
          task_id: { type: 'number' },
          title: { type: 'string' },
          game_id: { type: 'string' },
          level: { type: 'string', enum: ['critical', 'medium', 'low'] },
          assignee: { type: 'string' },
          due_date: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
}

export async function needsWorkPlan() {
  const [last] = await maybe("ai_insights?kind=eq.work_plan&select=created_at&order=created_at.desc&limit=1")
  return !last || last.created_at < day(7)
}

// Panelden "Haftayı planla" denince app_settings.work_plan.requested_at yazılır
export async function workPlanRequested() {
  const [req] = await maybe('app_settings?key=eq.work_plan&select=value')
  const at = req?.value?.requested_at
  if (!at) return false
  const [last] = await maybe("ai_insights?kind=eq.work_plan&select=created_at&order=created_at.desc&limit=1")
  return !last || last.created_at < at
}

export async function runWorkPlan() {
  const people = await maybe('admins?select=email,display_name,role')
  if (!people.length) return console.log('İş planı: ekip listesi boş')
  const games = await db('games?select=id,name&active=eq.true&hidden=is.false')
  const name = (id) => games.find((g) => g.id === id)?.name ?? null

  const open = await maybe('tasks?status=neq.done&select=id,title,status,level,game_id,assignee,due_date,tags,created_at&order=created_at.desc&limit=60')
  const done = await maybe(`tasks?status=eq.done&updated_at=gte.${day(30)}&select=title,game_id,assignee,tags&limit=80`)
  const activity = await maybe(`activity?created_at=gte.${day(30)}&select=who,what&order=created_at.desc&limit=80`)
  const alerts = await maybe('alerts?status=eq.open&select=level,source,game_id,title,deadline&order=created_at.desc&limit=20')
  const unanswered = await maybe(`reviews?created_at=gte.${day(30)}&store_reply=is.null&select=game_id,rating&limit=300`)
  const [adPlan] = await maybe('ad_plans?select=created_at&order=created_at.desc&limit=1')
  const pendingRecs = await maybe('recommendations?status=eq.pending&select=title,game_id&limit=10')

  // Kim ne tür işler yapıyor: son 30 günde bitirdiği işler ve hareketleri
  const profile = (email) => ({
    email,
    ad: people.find((p) => p.email === email)?.display_name || email.split('@')[0],
    rol: people.find((p) => p.email === email)?.role ?? null,
    acik_is: open.filter((t) => t.assignee === email).length,
    son_30_gun_bitirdikleri: done.filter((t) => t.assignee === email).map((t) => `${t.title}${t.game_id ? ` (${name(t.game_id)})` : ''}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`).slice(0, 20),
    son_hareketleri: activity.filter((a) => a.who === email).map((a) => cut(a.what, 100)).slice(0, 15),
  })

  const ctx = {
    ekip: people.map((p) => profile(p.email)),
    acik_isler: open.map((t) => ({ id: t.id, baslik: t.title, durum: t.status, seviye: t.level, oyun: name(t.game_id), game_id: t.game_id, sorumlu: t.assignee, son_tarih: t.due_date, etiketler: t.tags })),
    acik_uyarilar: alerts.map((a) => ({ seviye: a.level, kaynak: a.source, oyun: name(a.game_id), baslik: a.title, son_tarih: a.deadline })),
    cevapsiz_yorumlar: Object.entries(unanswered.reduce((m, r) => ((m[name(r.game_id) ?? '?'] = (m[name(r.game_id) ?? '?'] ?? 0) + 1), m), {})).map(([oyun, adet]) => ({ oyun, adet })),
    onay_bekleyen_reklam_onerileri: pendingRecs.map((r) => ({ baslik: r.title, oyun: name(r.game_id) })),
    son_reklam_plani: adPlan?.created_at ?? null,
    oyunlar: await metrics(games),
  }

  const prompt = [
    `Bugün: ${new Date().toISOString().slice(0, 10)}. Küçük bir mobil oyun stüdyosunun (2 kişi) bu haftasını planla.`,
    '- week_summary: Haftanın 2-3 cümlelik özeti: neye odaklanmalı, neden (rakamla).',
    '- focus: "ekip" listesindeki HER kişi için (email aynen) 1-2 cümle: bu hafta neye odaklanmalı.',
    '- suggestions: en fazla 8 öneri.',
    '  * kind "assign": sorumlusu olmayan (sorumlu null) açık işler için; task_id ve title aynen "acik_isler"den.',
    '  * kind "new_task": uyarılardan, cevapsız yorumlardan, metriklerden çıkan ve listede OLMAYAN somut işler.',
    '  * assignee: ekipteki bir e-posta. Kişinin son 30 günde yaptığı işlere bakarak uygun olanı seç; iş yükünü dengele.',
    '    Sadece metin/analiz işi (yorum cevabı taslağı, mağaza açıklaması, rapor) ise "assistant" yazabilirsin.',
    '  * game_id sadece "oyunlar"daki game_id değerlerinden; due_date YYYY-AA-GG (bu hafta içinde); why: tek cümle, neden bu kişi ve neden şimdi.',
    'Aynı işi iki kez önerme, zaten açık bir işi "new_task" diye önerme. Para harcayan işlerde "onayınla" de. Veride olmayan rakam uydurma.',
    '',
    'Veri (JSON):',
    JSON.stringify(ctx),
  ].join('\n')

  let result
  try {
    result = parse(await runClaude(prompt, SCHEMA))
  } catch (err) {
    await setConnection('claude', 'error', `İş planı: ${String(err.message).slice(0, 280)}`)
    throw err
  }

  const emails = new Set(people.map((p) => p.email))
  const openIds = new Set(open.filter((t) => !t.assignee).map((t) => t.id))
  const validGame = new Set(games.map((g) => g.id))
  const rows = (result.suggestions ?? [])
    .filter((s) => emails.has(s.assignee) || s.assignee === 'assistant')
    .filter((s) => s.kind === 'new_task' || openIds.has(s.task_id))
    .slice(0, 8)
    .map((s) => ({
      kind: s.kind,
      task_id: s.kind === 'assign' ? s.task_id : null,
      title: cut(s.title, 200),
      game_id: validGame.has(s.game_id) ? s.game_id : null,
      level: s.level,
      assignee: s.assignee,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(s.due_date ?? '') ? s.due_date : null,
      why: cut(s.why, 300),
    }))

  // Eski, karar verilmemiş öneriler yenilerine yer açar
  await db('work_suggestions?status=eq.pending', 'PATCH', { status: 'dismissed', decided_by: 'assistant', decided_at: new Date().toISOString() }, 'return=minimal').catch(() => {})
  if (rows.length) await db('work_suggestions', 'POST', rows, 'return=minimal')
  await db('ai_insights', 'POST', {
    kind: 'work_plan',
    content: { week_summary: cut(result.week_summary, 800), focus: (result.focus ?? []).filter((f) => emails.has(f.email)).map((f) => ({ email: f.email, summary: cut(f.summary, 400) })) },
  }, 'return=minimal')

  await notifyPeople([], { title: 'Haftanın iş planı hazır', body: cut(result.week_summary, 150), url: './#/calisma' })
  console.log(`İş planı: ${rows.length} öneri`)
}
