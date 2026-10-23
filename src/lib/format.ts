const usd = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = new Intl.NumberFormat('tr-TR')
const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })

export const money = (v: number) => usd.format(v)
export const money2 = (v: number) => usd2.format(v)
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

export function daysUntil(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

export const platformLabel = (p: string) => (p === 'ios' ? 'iOS' : 'Android')

// Değer yoksa (kaynak bağlı değil ya da veri gelmedi) "—"
export const orDash = (v: number | null | undefined, fmt: (n: number) => string) => (v == null ? '—' : fmt(v))
