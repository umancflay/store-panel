// Gelir hedefi ve ani düşüş uyarısı. Hedef panelden girilir (app_settings.revenue_goal, TL).
// Günlük işte çalışır: dün gelir son 7 günün ortalamasından çok düştüyse uyarı + telefona bildirim,
// pazartesi sabahı hedef gidişatı, hedefe ulaşılan ilk gün tebrik bildirimi. Hiçbir şey harcamaz, değiştirmez.

import { db, upsert } from './db.mjs'

export const GOAL_DEFAULTS = { monthly: 0, dropAlert: true, dropPct: 50, minAvg: 5, reached: null }

// Türkiye takvim günü (GitHub UTC'de çalışır)
export const trDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
const shift = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const tl = (v) => '₺' + (v >= 100 ? Math.round(v).toLocaleString('tr-TR') : v.toFixed(2).replace('.', ','))

// days: { 'YYYY-AA-GG': TL } (bugün hariç tam günler). Dün son 7 günün ortalamasından dropPct kadar düştüyse döner.
export function revenueDrop(days, today, { dropPct = 50, minAvg = 5 } = {}) {
  const y = shift(today, -1)
  if (!(y in days)) return null
  const prev = Array.from({ length: 7 }, (_, i) => days[shift(today, -2 - i)]).filter((v) => v != null)
  if (prev.length < 5) return null
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length
  if (avg < minAvg) return null // gelir çok küçükse gürültü
  const pct = ((avg - days[y]) / avg) * 100
  return pct >= dropPct ? { date: y, value: days[y], avg, pct } : null
}

// Ayın gidişatı: şimdiye kadar, ay sonu tahmini, hedefe günde ne lazım
export function goalProgress(days, today, goal) {
  const month = today.slice(0, 7)
  const elapsed = Number(today.slice(8, 10)) - 1 // tamamlanan gün
  const [yy, mm] = month.split('-').map(Number)
  const length = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
  const sofar = Object.entries(days).filter(([d]) => d.startsWith(month) && d < today).reduce((a, [, v]) => a + v, 0)
  const last7 = Array.from({ length: 7 }, (_, i) => days[shift(today, -1 - i)]).filter((v) => v != null)
  const pace = elapsed > 0 ? sofar / elapsed : last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : 0
  const left = length - elapsed
  const projected = sofar + pace * left
  return { month, sofar, pace, projected, left, need: goal > 0 ? Math.max(0, (goal - sofar) / left) : 0, ratio: goal > 0 ? sofar / goal : 0 }
}

// Geçen 7 gün ile önceki 7 günün toplamı (pazartesi özeti)
export function weekSummary(days, today) {
  const sum = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => days[shift(today, -from - i)] ?? 0).reduce((a, b) => a + b, 0)
  const last = sum(1, 7)
  const prev = sum(8, 14)
  return { last, prev, change: prev > 0 ? ((last - prev) / prev) * 100 : null }
}

async function all(path) {
  const out = []
  for (let off = 0; ; off += 1000) {
    const page = await db(`${path}&limit=1000&offset=${off}`)
    out.push(...page)
    if (page.length < 1000) return out
  }
}

// Gün gün toplam gelir (TL): AdMob'un kendi TL tutarı, yoksa günün kuru; mağaza satışları kurla
async function dailyTry(from) {
  const fx = (await db('app_settings?key=eq.fx_usd_try&select=value'))[0]?.value ?? {}
  const fxDays = Object.keys(fx).sort()
  const rate = (d) => fx[d] ?? fx[fxDays.filter((x) => x <= d).pop()] ?? fx[fxDays[fxDays.length - 1]] ?? 0
  const days = {}
  for (const r of await all(`admob_daily?date=gte.${from}&select=date,revenue,revenue_try`)) {
    const v = Number(r.revenue_try) > 0 ? Number(r.revenue_try) : Number(r.revenue ?? 0) * rate(r.date)
    days[r.date] = (days[r.date] ?? 0) + v
  }
  for (const r of await all(`store_daily?date=gte.${from}&select=date,iap_revenue`)) {
    if (r.iap_revenue) days[r.date] = (days[r.date] ?? 0) + Number(r.iap_revenue) * rate(r.date)
  }
  return days
}

export async function applyGoals() {
  const stored = (await db('app_settings?key=eq.revenue_goal&select=value'))[0]?.value ?? {}
  const goal = { ...GOAL_DEFAULTS, ...stored }
  const today = trDay()
  const days = Object.fromEntries(Object.entries(await dailyTry(shift(today, -40))).filter(([d]) => d < today))
  const notes = []

  if (goal.dropAlert) {
    const drop = revenueDrop(days, today, goal)
    if (drop) {
      const title = `Dün gelir %${Math.round(drop.pct)} düştü (${tl(drop.value)})`
      const body = `Son 7 günün ortalaması ${tl(drop.avg)}. Reklam gösterimi, fill rate ya da bir oyunda çökme olabilir; Gelir sayfasında oyun oyun bak.`
      const existing = await db(`alerts?external_id=eq.revenue_drop-${drop.date}&select=id`)
      if (!existing.length) {
        await upsert('alerts', [{
          external_id: `revenue_drop-${drop.date}`, level: 'warning', source: 'admob', title, body,
          how_to_fix: [
            'Gelir sayfasında "Oyun" görünümünde hangi oyunun düştüğüne bak.',
            'Gösterim sayısı da düştüyse oyuncu sayısı ya da reklam yerleşimi sorunu olabilir; Komuta\'da çökmelere bak.',
            'Gösterim aynı ama gelir düştüyse eCPM düşmüştür; AdMob › Mediation\'da ağları kontrol et.',
          ].join('\n'),
          console_url: '#/gelir',
        }], 'external_id')
        await db('notify_outbox', 'POST', { title, body, url: './#/gelir' }, 'return=minimal')
        notes.push('düşüş uyarısı')
      }
    }
  }

  const monday = new Date(today + 'T12:00:00Z').getUTCDay() === 1
  const p = goal.monthly > 0 ? goalProgress(days, today, goal.monthly) : null
  if (p && p.sofar >= goal.monthly && goal.reached !== p.month) {
    await db('notify_outbox', 'POST', { title: 'Aylık gelir hedefine ulaştın 🎉', body: `Bu ay ${tl(p.sofar)} kazandın; hedef ${tl(goal.monthly)} idi.`, url: './#/gelir' }, 'return=minimal')
    await upsert('app_settings', [{ key: 'revenue_goal', value: { ...stored, reached: p.month }, updated_at: new Date().toISOString() }], 'key')
    notes.push('hedef tebriği')
  }
  // Pazartesi sabahı: geçen haftanın geliri ve (varsa) hedef gidişatı
  if (monday) {
    const w = weekSummary(days, today)
    const trend = w.change == null ? '' : ` (önceki haftaya göre ${w.change >= 0 ? '+' : ''}%${Math.round(w.change)})`
    const goalLine = p && p.sofar < goal.monthly
      ? ` Bu ay ${tl(p.sofar)} / ${tl(goal.monthly)}; bu hızla ay sonu ~${tl(p.projected)}.${p.projected >= goal.monthly ? ' Hedef yolunda.' : ` Hedef için günde ${tl(p.need)} lazım.`}`
      : ''
    await db('notify_outbox', 'POST', { title: `Geçen hafta ${tl(w.last)} kazandın${trend}`, body: `Haftalık gelir özeti.${goalLine}`.trim(), url: './#/gelir' }, 'return=minimal')
    notes.push('haftalık özet')
  }
  console.log(`Gelir hedefi: ${notes.length ? notes.join(', ') : 'bildirim yok'}`)
}
