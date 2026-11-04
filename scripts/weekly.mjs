// Haftalık rapor: pazartesi sabahı (ya da son rapor 7 günden eskiyse) Claude geçen haftayı tek sayfada özetler:
// ne iyi gitti, neye dikkat, bu hafta yapılacak 3 iş. ai_insights.weekly_report'a yazılır, telefona bildirim gider.

import { db } from './db.mjs'
import { metrics, parse, runClaude } from './ai.mjs'

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const r2 = (v) => Math.round(v * 100) / 100

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'good', 'bad', 'tasks'],
  properties: {
    headline: { type: 'string' },
    good: { type: 'array', items: { type: 'string' } },
    bad: { type: 'array', items: { type: 'string' } },
    tasks: { type: 'array', items: { type: 'string' } },
  },
}

export async function weeklyDue(now = new Date()) {
  const last = (await db("ai_insights?kind=eq.weekly_report&select=created_at&order=created_at.desc&limit=1").catch(() => []))[0]
  if (!last) return true
  const age = now - Date.parse(last.created_at)
  return (now.getUTCDay() === 1 && age > 3 * 86400000) || age > 7 * 86400000
}

// Ülke bazında bu hafta / geçen hafta reklam geliri (USD)
export function countryWeeks(rows, today = day(0)) {
  const start = day(7)
  const prevStart = day(14)
  const m = new Map()
  for (const r of rows) {
    if (r.date >= today) continue
    const e = m.get(r.country) ?? { ulke: r.country, bu_hafta: 0, gecen_hafta: 0 }
    if (r.date >= start) e.bu_hafta += Number(r.revenue ?? 0)
    else if (r.date >= prevStart) e.gecen_hafta += Number(r.revenue ?? 0)
    m.set(r.country, e)
  }
  return [...m.values()].map((e) => ({ ...e, bu_hafta: r2(e.bu_hafta), gecen_hafta: r2(e.gecen_hafta) })).sort((a, b) => b.bu_hafta - a.bu_hafta).slice(0, 10)
}

export async function runWeekly() {
  const games = await db('games?select=id,name&active=eq.true&hidden=is.false')
  const perGame = await metrics(games)
  const ads = await db(`admob_daily?select=date,country,revenue&date=gte.${day(14)}&limit=20000`)
  const camps = await db(`campaigns?select=platform,name,spend,results,result_type&date=gte.${day(7)}`).catch(() => [])
  const spend = camps.reduce((a, c) => a + Number(c.spend ?? 0), 0)
  const prompt = [
    `Bugün: ${day(0)}. Görev: geçen haftanın (son 7 gün, önceki 7 günle kıyas) kısa raporu, Türkçe, sahibine "sen" diye.`,
    '- headline: tek cümle, en önemli değişiklik rakamıyla.',
    '- good: iyi giden 2-3 madde (rakamla). bad: dikkat edilecek 1-3 madde (rakamla; yoksa boş liste).',
    '- tasks: bu hafta yapılacak en önemli 3 iş; somut, uygulanabilir. Para harcatan iş varsa "onayınla" de.',
    '- Veride olmayan rakam uydurma.',
    '',
    'Veri (JSON):',
    JSON.stringify({ oyunlar: perGame, ulkeler: countryWeeks(ads), reklam_harcamasi_7gun_usd: r2(spend), kampanya_sayisi: new Set(camps.map((c) => c.name)).size }),
  ].join('\n')
  const out = parse(await runClaude(prompt, SCHEMA, { model: process.env.CLAUDE_FAST_MODEL || 'sonnet', timeoutMin: 6 }))
  const content = { week: `${day(7)} – ${day(1)}`, headline: out.headline, good: out.good.slice(0, 3), bad: out.bad.slice(0, 3), tasks: out.tasks.slice(0, 3) }
  await db('ai_insights', 'POST', { kind: 'weekly_report', content }, 'return=minimal')
  await db('notify_outbox', 'POST', { title: 'Haftalık rapor hazır', body: out.headline.slice(0, 160), url: './#/veriler' }, 'return=minimal')
  console.log(`Haftalık rapor: ${out.headline}`)
}
