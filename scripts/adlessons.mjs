// Öğrenen hafıza: Stüdyo'da "yayımladım" denen reklam videoları bağlandıkları kampanyaların gerçek sonuçlarıyla eşleşir.
// Her video için yayından bu yana harcama, sonuç, tıklama oranı ve sonuç başı maliyet; oyunun ortalamasıyla kıyas.
// Az veride hüküm verilmez ("erken"). Ret edilen fikirler ve sebepleri de ders olarak saklanır.
// Sonuç: app_settings.ad_lessons. Günlük işte ve her yeni fikir isteğinden önce güncellenir. Yapay zeka kullanmaz.

import { db } from './db.mjs'

const MIN_SPEND = 5 // USD; altında "erken"
const MIN_IMPR = 1000
const r2 = (v) => Math.round(v * 100) / 100

function sum(rows) {
  return rows.reduce(
    (a, r) => ({
      spend: a.spend + Number(r.spend ?? 0),
      impressions: a.impressions + Number(r.impressions ?? 0),
      clicks: a.clicks + Number(r.clicks ?? 0),
      results: a.results + Number(r.results ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, results: 0 },
  )
}

// projects: app_settings.ad_projects.items; campaigns: campaigns satırları (günlük)
export function computeLessons(projects, campaigns) {
  const lessons = []
  for (const p of projects) {
    if (p.status !== 'published' || !p.campaignIds?.length) continue
    const since = (p.publishedAt ?? p.updatedAt ?? p.createdAt ?? '').slice(0, 10)
    const ids = new Set(p.campaignIds)
    const mine = campaigns.filter((c) => ids.has(`${c.platform}:${c.external_id}`) && c.date >= since)
    const others = campaigns.filter((c) => c.game_id === p.gameId && !ids.has(`${c.platform}:${c.external_id}`))
    const m = sum(mine)
    const o = sum(others)
    const cpr = m.results ? m.spend / m.results : null
    const avg = o.results ? o.spend / o.results : null
    const ctr = m.impressions ? (m.clicks / m.impressions) * 100 : null
    let verdict = 'erken'
    let diff = null
    if (m.spend >= MIN_SPEND && m.impressions >= MIN_IMPR) {
      if (cpr != null && avg != null) {
        diff = Math.round(((cpr - avg) / avg) * 100)
        verdict = diff <= -15 ? 'iyi' : diff >= 15 ? 'kotu' : 'orta'
      } else verdict = m.results ? 'orta' : 'kotu'
    }
    const facts = [
      `${Math.round(m.impressions).toLocaleString('tr-TR')} gösterim`,
      ctr != null ? `TO %${ctr.toFixed(2).replace('.', ',')}` : null,
      `${r2(m.spend)} $ harcama`,
      cpr != null ? `sonuç başı ${r2(cpr)} $` : 'sonuç yok',
      diff != null ? `oyunun diğer reklamlarından %${Math.abs(diff)} ${diff < 0 ? 'ucuz' : 'pahalı'}` : null,
    ].filter(Boolean)
    lessons.push({
      kind: 'result', gameId: p.gameId, projectId: p.id, title: p.idea?.title ?? '', platform: p.publishedOn ?? p.idea?.platform ?? '',
      hook: p.idea?.hook ?? '', verdict, spend: r2(m.spend), results: m.results, cpr: cpr == null ? null : r2(cpr), avgCpr: avg == null ? null : r2(avg),
      ctr: ctr == null ? null : r2(ctr),
      text: verdict === 'erken' ? `"${p.idea?.title}" için veri az (${facts.slice(0, 3).join(', ')}); henüz hüküm yok.` : `"${p.idea?.title}" (${p.publishedOn ?? ''}): ${facts.join(', ')}.`,
    })
  }
  for (const p of projects) {
    for (const r of p.rejected ?? []) {
      lessons.push({ kind: 'rejected', gameId: p.gameId, projectId: p.id, title: r.title, verdict: 'ret', text: `"${r.title}" fikri reddedildi: ${r.reason || 'sebep yazılmadı'}.` })
    }
  }
  return lessons
}

async function setting(key) {
  try {
    return (await db(`app_settings?select=value&key=eq.${key}`))[0]?.value ?? null
  } catch {
    return null
  }
}

export async function updateAdLessons() {
  const projects = (await setting('ad_projects'))?.items ?? []
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
  const campaigns = projects.some((p) => p.campaignIds?.length)
    ? await db(`campaigns?select=platform,external_id,game_id,date,spend,impressions,clicks,results&date=gte.${since}&limit=20000`)
    : []
  const items = computeLessons(projects, campaigns)
  await db('app_settings?on_conflict=key', 'POST', { key: 'ad_lessons', value: { at: new Date().toISOString(), items }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
  console.log(`Reklam dersleri: ${items.length}`)
  return items
}
