import { useCallback, useEffect, useState } from 'react'
import { supabase, isDemo } from './supabase'

// Demo modda sayfalar arası geçişte değişiklikler kaybolmasın
const demoCache = new Map<string, unknown[]>()

// Bir Supabase tablosunu okuyup yazmak için ortak kanca (görevler, notlar, planlar …).
// Gerçek modda değişiklik önce ekranda görünür, sonra veritabanına yazılır.
// Demo modda sadece bu oturumda tutulur.
export function useRows<T extends { id: number }>(
  table: string,
  demoRows: T[],
  opts: { order?: string; ascending?: boolean; filter?: [string, string | number] } = {},
) {
  const [rows, setRows] = useState<T[]>(isDemo ? ((demoCache.get(table) as T[]) ?? demoRows) : [])
  const [loading, setLoading] = useState(!isDemo)
  const [error, setError] = useState<string | null>(null)
  const { order = 'id', ascending = true, filter } = opts
  const filterKey = filter ? `${filter[0]}=${filter[1]}` : ''

  const load = useCallback(async () => {
    if (isDemo) return
    let q = supabase!.from(table).select('*').order(order, { ascending })
    if (filter) q = q.eq(filter[0], filter[1])
    const { data, error } = await q
    if (error) setError(error.message)
    else setRows(data as T[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, order, ascending, filterKey])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (isDemo) demoCache.set(table, rows)
  }, [table, rows])

  const insert = useCallback(
    async (obj: Partial<T>): Promise<T> => {
      if (isDemo) {
        const row = { ...obj, id: Date.now() + Math.floor(Math.random() * 1000), created_at: new Date().toISOString() } as unknown as T
        setRows((r) => [...r, row])
        return row
      }
      const { data, error } = await supabase!.from(table).insert(obj as never).select().single()
      if (error) throw new Error(error.message)
      setRows((r) => [...r, data as T])
      return data as T
    },
    [table],
  )

  const update = useCallback(
    async (id: number, patch: Partial<T>) => {
      setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)))
      if (isDemo) return
      const { error } = await supabase!.from(table).update(patch as never).eq('id', id)
      if (error) throw new Error(error.message)
    },
    [table],
  )

  const remove = useCallback(
    async (id: number) => {
      setRows((r) => r.filter((x) => x.id !== id))
      if (isDemo) return
      const { error } = await supabase!.from(table).delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    [table],
  )

  return { rows, setRows, loading, error, insert, update, remove, reload: load }
}

// Türkçe tarih yardımcıları
export const today = () => new Date().toISOString().slice(0, 10)
export function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const monthName = (m: number) => MONTHS[m]
export function trDate(iso: string | null | undefined, withYear = false) {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`
}
export function trDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Tek bir ayar (app_settings tablosu, anahtar → JSON değer)
export function useSetting<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback)
  useEffect(() => {
    if (isDemo) return
    supabase!.from('app_settings').select('value').eq('key', key).maybeSingle().then(({ data }) => {
      if (data) setValue({ ...fallback, ...(data as { value: T }).value })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const save = useCallback(
    async (v: T) => {
      setValue(v)
      if (isDemo) return
      const { error } = await supabase!.from('app_settings').upsert({ key, value: v, updated_at: new Date().toISOString() } as never)
      if (error) throw new Error(error.message)
    },
    [key],
  )
  return [value, save] as const
}

// Claude'un en son ürettiği çıktı (ai_insights tablosu): günün özeti, yorum grupları …
export function useInsight<T>(kind: string) {
  const [value, setValue] = useState<{ content: T; created_at: string } | null>(null)
  useEffect(() => {
    if (isDemo) return
    supabase!
      .from('ai_insights')
      .select('content,created_at')
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setValue((data as { content: T; created_at: string } | null) ?? null))
  }, [kind])
  return value
}
