import { useCallback, useEffect, useState } from 'react'
import { supabase, isDemo } from './supabase'
import { triggerWorkflow } from './trigger'

// Yayın Uzmanı'na panelden iş verme: app_settings.expert_queue'ya yazılır, uzman işi hemen başlatılır.
// Sonuçlar yine app_settings'e (aso:<oyun>, whatsnew:<oyun>, rejection:<oyun>) yazılır.

export type QueueItem = { id: string; kind: 'aso' | 'notes' | 'rejection' | 'devicetest' | 'ask'; gameId: string; buildId?: number; by: string; at: string; bullets?: string; text?: string; fixes?: string; appeal?: boolean }

// Tek bir app_settings satırı; anahtar değişince sıfırlanır
export function useSettingRow<T>(key: string, demo: T | null) {
  const [value, setValue] = useState<T | null>(isDemo ? demo : null)
  const load = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase!.from('app_settings').select('value').eq('key', key).maybeSingle()
    setValue((data as { value: T } | null)?.value ?? null)
  }, [key])
  useEffect(() => {
    setValue(isDemo ? demo : null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return [value, load] as const
}

// Aynı oyun için aynı türde bekleyen iş varsa yenisiyle değiştirilir. Hata metni döner (yoksa null).
export async function enqueue(item: Omit<QueueItem, 'id' | 'at'>): Promise<{ error: string | null; started: boolean }> {
  const { data } = await supabase!.from('app_settings').select('value').eq('key', 'expert_queue').maybeSingle()
  const items = ((data as { value?: { items?: QueueItem[] } } | null)?.value?.items ?? []).filter((i) => !(i.kind === item.kind && i.gameId === item.gameId))
  items.push({ ...item, id: crypto.randomUUID(), at: new Date().toISOString() })
  const { error } = await supabase!.from('app_settings').upsert({ key: 'expert_queue', value: { items }, updated_at: new Date().toISOString() } as never)
  if (error) return { error: error.message, started: false }
  return { error: null, started: !(await triggerWorkflow('expert.yml')) }
}
