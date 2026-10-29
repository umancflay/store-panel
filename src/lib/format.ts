// Para birimi: veriler USD saklanır; panel seçilen birimde gösterir (varsayılan TL).
// Çeviriyi veri katmanı yapar (lib/data.tsx), burada sadece biçim seçilir.
export type Currency = 'TRY' | 'USD'
let currency: Currency = 'TRY'
const fmt = (c: Currency, digits: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: c, minimumFractionDigits: digits, maximumFractionDigits: digits })
let cur0 = fmt('TRY', 0)
let cur2 = fmt('TRY', 2)
export function setCurrency(c: Currency) {
  if (c === currency) return
  currency = c
  cur0 = fmt(c, 0)
  cur2 = fmt(c, 2)
}
export const currencySymbol = () => (currency === 'TRY' ? '₺' : '$')

const num = new Intl.NumberFormat('tr-TR')
const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })

// TL'de küçük tutarlar kuruşlu daha anlamlı (₺3,82); büyük tutarlarda kuruş gösterilmez
export const money = (v: number) => (Math.abs(v) < 1000 && currency === 'TRY' ? cur2.format(v) : cur0.format(v))
export const money2 = (v: number) => cur2.format(v)
export const int = (v: number) => num.format(Math.round(v))
export const short = (v: number) => compact.format(v)
export const pct = (v: number, digits = 1) => `%${v.toFixed(digits).replace('.', ',')}`

export function change(cur: number, prev: number) {
  return prev ? ((cur - prev) / prev) * 100 : 0
}

export function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export function dateLong(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Yerel takvim günü (YYYY-AA-GG). toISOString UTC'ye çevirir; Türkiye'de (UTC+3) yerel gece yarısı bir önceki güne düşer.
export const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function daysUntil(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

export const platformLabel = (p: string) => (p === 'ios' ? 'iOS' : 'Android')

// Değer yoksa (kaynak bağlı değil ya da veri gelmedi) "—"
export const orDash = (v: number | null | undefined, fmt: (n: number) => string) => (v == null ? '—' : fmt(v))

// Ülke kodu → Türkçe ad ("TR" → "Türkiye")
const regionNames = new Intl.DisplayNames(['tr'], { type: 'region' })
export const countryName = (c: string) => {
  try {
    return regionNames.of(c) ?? c
  } catch {
    return c
  }
}
