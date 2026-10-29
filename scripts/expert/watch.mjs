// Canlı izleme (sessiz): yayından sonra 48 saat yeni sürümün çökme ve ANR oranını eski sürümlerle karşılaştırır.
// Hiçbir şeyi bekletmez; sadece kötüye giderse haber verir ve durdurmayı ÖNERİR (onay bekleyen "halt" eylemi), kendisi durdurmaz.

import { saToken } from '../play.mjs'

const REPORTING = 'https://playdeveloperreporting.googleapis.com/v1beta1'
export const WATCH_HOURS = 48
const pct = (v) => `%${v.toFixed(2).replace('.', ',')}`

// newRate/oldRate yüzde, users yeni sürümün kullanıcı sayısı
export function judge({ crash, anr }) {
  const bad = (m, limit) => m && m.users >= 50 && m.newRate >= Math.max(limit, m.oldRate * 2)
  const warn = (m, limit) => m && m.users >= 20 && m.newRate > Math.max(limit / 2, m.oldRate * 1.5)
  if (bad(crash, 1.09)) return { verdict: 'bad', text: `Yeni sürümde çökme ${pct(crash.newRate)} (eski sürümlerde ${pct(crash.oldRate)}).` }
  if (bad(anr, 0.47)) return { verdict: 'bad', text: `Yeni sürümde donma (ANR) ${pct(anr.newRate)} (eski sürümlerde ${pct(anr.oldRate)}).` }
  if (warn(crash, 1.09) || warn(anr, 0.47)) return { verdict: 'warn', text: `Yeni sürümde çökme ${pct(crash?.newRate ?? 0)}, ANR ${pct(anr?.newRate ?? 0)}; eskilerden biraz yüksek, izliyorum.` }
  if ((crash?.users ?? 0) < 20 && (anr?.users ?? 0) < 20) return { verdict: 'wait', text: 'Yeni sürümden henüz yeterli veri yok (Google 2–6 saat geriden verir, en az 20 oyuncu gerekir).' }
  return { verdict: 'ok', text: `Yeni sürüm sağlıklı: çökme ${pct(crash?.newRate ?? 0)}, ANR ${pct(anr?.newRate ?? 0)}.` }
}

// Saatlik satırları sürüm koduna göre ağırlıklı ortalamaya çevirir
export function splitByVersion(rows, metric, versionCode) {
  const acc = { new: [0, 0], old: [0, 0] }
  for (const r of rows) {
    const vc = String(r.dimensions?.find((x) => x.dimension === 'versionCode')?.stringValue ?? r.dimensions?.find((x) => x.dimension === 'versionCode')?.int64Value ?? '')
    const rate = Number(r.metrics?.find((m) => m.metric === metric)?.decimalValue?.value ?? NaN)
    const users = Number(r.metrics?.find((m) => m.metric === 'distinctUsers')?.decimalValue?.value ?? 0)
    if (Number.isNaN(rate) || !users) continue
    const k = vc === String(versionCode) ? 'new' : 'old'
    acc[k][0] += rate * users
    acc[k][1] += users
  }
  return { newRate: acc.new[1] ? (acc.new[0] / acc.new[1]) * 100 : 0, oldRate: acc.old[1] ? (acc.old[0] / acc.old[1]) * 100 : 0, users: acc.new[1] }
}

export async function versionVitals(pkg, versionCode, { fetchImpl = fetch, tokenImpl = saToken, hours = WATCH_HOURS } = {}) {
  const call = async (url, body) => {
    const res = await fetchImpl(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await tokenImpl()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    if (!res.ok) throw new Error(`Play vitals (${res.status}): ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : {}
  }
  const one = async (set, metric) => {
    const info = await call(`${REPORTING}/apps/${pkg}/${set}`)
    const e = info.freshnessInfo?.freshnesses?.find((f) => f.aggregationPeriod === 'HOURLY')?.latestEndTime
    if (!e) return null
    const end = new Date(Date.UTC(e.year, e.month - 1, e.day, e.hours ?? 0))
    const start = new Date(end.getTime() - hours * 3600000)
    const t = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hours: d.getUTCHours(), timeZone: { id: 'UTC' } })
    const out = await call(`${REPORTING}/apps/${pkg}/${set}:query`, {
      timelineSpec: { aggregationPeriod: 'HOURLY', startTime: t(start), endTime: t(end) },
      dimensions: ['versionCode'], metrics: [metric, 'distinctUsers'], pageSize: 1000,
    })
    return splitByVersion(out.rows ?? [], metric, versionCode)
  }
  return { crash: await one('crashRateMetricSet', 'crashRate'), anr: await one('anrRateMetricSet', 'anrRate') }
}

// Yayındaki ve 48 saati dolmamış, son bakışın üstünden bir saat geçmiş build'ler
export async function dueBuilds(db) {
  const live = await db('store_builds?status=eq.live&select=id,game_id,package_name,version_code,version_name,report,created_by').catch(() => [])
  const now = Date.now()
  return live.filter((b) => {
    const w = b.report?.watch
    if (w?.done) return false
    return !w?.at || now - Date.parse(w.at) > 55 * 60000
  })
}

export async function watchLive(d) {
  let n = 0
  for (const b of await dueBuilds(d.db)) {
    const [pub] = await d.db(`expert_actions?build_id=eq.${b.id}&kind=eq.publish_production&status=eq.done&select=approved_at`)
    const since = b.report?.watch?.since ?? pub?.approved_at ?? new Date().toISOString()
    const done = Date.now() - Date.parse(since) >= WATCH_HOURS * 3600000
    let res
    try {
      res = judge(await d.vitals(b.package_name, b.version_code))
    } catch (e) {
      res = { verdict: 'wait', text: `Play'den çökme verisi alınamadı: ${String(e.message).slice(0, 150)}` }
    }
    const watch = { at: new Date().toISOString(), since, verdict: res.verdict, text: res.text, done: done && res.verdict !== 'bad', alerted: b.report?.watch?.alerted ?? false }

    if (res.verdict === 'bad' && !watch.alerted) {
      const open = await d.db(`expert_actions?build_id=eq.${b.id}&kind=eq.halt&status=eq.pending&select=id`)
      if (!open.length) await d.db('expert_actions', 'POST', { build_id: b.id, kind: 'halt', params: { reason: res.text }, status: 'pending' }, 'return=minimal')
      await d.notify(null, `${b.version_name}: çökmeler arttı, yayını durdurayım mı?`, `${res.text} Panelde "Durdur"a basarsan yeni oyunculara gitmesi durur.`, './#/yayin')
      watch.alerted = true
    }
    await d.db(`store_builds?id=eq.${b.id}`, 'PATCH', { report: { ...(b.report ?? {}), watch } }, 'return=minimal')
    n++
  }
  return n
}
