import { supabase } from './supabase'

// GitHub Actions işini hemen başlatır (Supabase Edge Function "trigger-update" üzerinden).
// Zamanlanmış işler GitHub'da güvenilir değil; soru, onay ya da build gibi olaylarda bu çağrılır.
// Başlatılamazsa (fonksiyon kurulmamış vb.) sessizce null olmayan hata metni döner; zamanlanmış iş yedek kalır.
export type Workflow = 'collect-data.yml' | 'assistant.yml' | 'expert.yml'

export async function triggerWorkflow(workflow: Workflow): Promise<string | null> {
  if (!supabase) return 'demo'
  const { error } = await supabase.functions.invoke('trigger-update', { body: { workflow } })
  return error ? error.message : null
}
