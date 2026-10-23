import type { Alert, Build, DailyRow, Game } from '../data/sample'
import { change, money, pct } from './format'
import { limits, periodRows, totals } from './metrics'

// Komuta merkezi: her oyun için "sinyal → değerlendirme → aksiyon" satırları.
// Tamamı gerçek veriden hesaplanır: açık uyarılar, sürüm durumu, çökme/ANR, puan, fill rate, gelir.

export type Level = 'k' | 'd' | 'n'
export const levelColor: Record<Level, string> = { k: '#FF7A55', d: '#E8C07A', n: '#8FD3AE' }
export const levelText: Record<Level, string> = { k: 'Kritik', d: 'Dikkat', n: 'Normal' }

export interface Signal {
  key: string
  gameId: string
  level: Level
  label: string
  value: string
  action: string
}

export interface GameSignals {
  game: Game
  headline: string
  headlineLabel: string
  signals: Signal[]
}

export function computeSignals(games: Game[], daily: DailyRow[], alerts: Alert[], builds: Build[], hasStore: boolean): GameSignals[] {
  return games.map((g) => {
    const rows = (r: DailyRow) => r.gameId === g.id
    const { cur, prev } = periodRows(daily, 7, rows)
    const t = totals(cur)
    const p = totals(prev)
    const out: Signal[] = []

    for (const a of alerts.filter((a) => a.gameId === g.id && a.status === 'open')) {
      out.push({
        key: `alert:${a.id}`,
        gameId: g.id,
        level: a.level === 'critical' ? 'k' : a.level === 'warning' ? 'd' : 'n',
        label: a.title,
        value: a.deadline ? `${Math.max(0, Math.round((new Date(a.deadline).getTime() - Date.now()) / 86400000))} gün` : 'Uyarı',
        action: a.howToFix[0] ?? 'Uyarıyı incele',
      })
    }

    for (const b of builds.filter((b) => b.gameId === g.id)) {
      if (/Reddedildi|Geçersiz/.test(b.status)) {
        out.push({ key: `build:${g.id}:${b.platform}`, gameId: g.id, level: 'k', label: `${b.platform === 'ios' ? 'App Store' : 'Play'} incelemesi · ${b.version}`, value: 'Red', action: 'Mesajı oku, düzeltip yeniden gönder' })
      } else if (/İnceleme|Bekliyor/i.test(b.status)) {
        out.push({ key: `build:${g.id}:${b.platform}`, gameId: g.id, level: 'n', label: `${b.platform === 'ios' ? 'App Store' : 'Play'} incelemesi · ${b.version}`, value: 'Bekliyor', action: 'Sonucu bekle' })
      }
    }

    if (t.crashRate != null) {
      const lv: Level = t.crashRate > limits.crash ? 'k' : t.crashRate > limits.crash * 0.7 ? 'd' : 'n'
      out.push({ key: `crash:${g.id}`, gameId: g.id, level: lv, label: 'Çökme oranı · 7 gün', value: pct(t.crashRate, 2), action: lv === 'n' ? 'İzlemeye devam' : 'En sık çökmeyi düzeltip hızlı sürüm çıkar' })
    }
    if (t.anrRate != null && t.anrRate > limits.anr) {
      out.push({ key: `anr:${g.id}`, gameId: g.id, level: 'k', label: 'ANR oranı · 7 gün', value: pct(t.anrRate, 2), action: 'Ana iş parçacığındaki uzun işleri taşı' })
    }
    if (t.rating != null) {
      const lv: Level = t.rating < limits.rating ? 'd' : 'n'
      out.push({ key: `rating:${g.id}`, gameId: g.id, level: lv, label: 'Mağaza puanı', value: t.rating.toFixed(1).replace('.', ','), action: lv === 'n' ? 'İzlemeye devam' : 'Kötü yorumlara cevap ver, sık şikayeti düzelt' })
    }
    if (t.requests > 100 && t.fillRate < 85) {
      out.push({ key: `fill:${g.id}`, gameId: g.id, level: 'd', label: 'Fill rate · 7 gün', value: pct(t.fillRate, 0), action: 'Mediation’a ikinci reklam ağı ekle' })
    }
    if (t.adRevenue > 0 || p.adRevenue > 0) {
      const d = change(t.adRevenue, p.adRevenue)
      const lv: Level = p.adRevenue > 1 && d < -25 ? 'd' : 'n'
      out.push({ key: `rev:${g.id}`, gameId: g.id, level: lv, label: 'AdMob geliri · 7 gün', value: money(t.adRevenue), action: lv === 'n' ? 'İzlemeye devam' : `Gelir %${Math.abs(d).toFixed(0)} düştü, Gelir sayfasında sebebine bak` })
    }

    const order: Record<Level, number> = { k: 0, d: 1, n: 2 }
    out.sort((a, b) => order[a.level] - order[b.level])
    return {
      game: g,
      headline: hasStore && t.downloads > 0 ? t.downloads.toLocaleString('tr-TR') : money(t.revenue),
      headlineLabel: hasStore && t.downloads > 0 ? 'indirme · 7 gün' : 'gelir · 7 gün',
      signals: out,
    }
  })
}
