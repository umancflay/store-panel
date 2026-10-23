import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { alerts as sampleAlerts, recommendations as sampleRecs, type Alert, type Recommendation } from '../data/sample'
import { supabase } from './supabase'

// Uygulama genelinde paylaşılan durum: uyarılar, öneriler ve bildirim balonları.
// 1. aşamada örnek verilerle çalışır; değişiklikler sadece bu oturumda tutulur.

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'info'
}

interface StoreState {
  alerts: Alert[]
  resolveAlert: (id: number) => void
  reopenAlert: (id: number) => void
  recs: Recommendation[]
  decide: (id: number, status: 'approved' | 'rejected') => void
  toasts: Toast[]
  toast: (text: string, tone?: Toast['tone']) => void
  triggerUpdate: () => Promise<void>
  updating: boolean
}

const StoreContext = createContext<StoreState | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState(sampleAlerts)
  const [recs, setRecs] = useState(sampleRecs)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [updating, setUpdating] = useState(false)

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const setAlertStatus = (id: number, status: Alert['status']) =>
    setAlerts((list) => list.map((a) => (a.id === id ? { ...a, status } : a)))

  const resolveAlert = (id: number) => {
    setAlertStatus(id, 'resolved')
    toast('Uyarı çözüldü olarak işaretlendi')
  }
  const reopenAlert = (id: number) => {
    setAlertStatus(id, 'open')
    toast('Uyarı yeniden açıldı', 'info')
  }

  const decide = (id: number, status: 'approved' | 'rejected') => {
    setRecs((list) => list.map((r) => (r.id === id ? { ...r, status } : r)))
    toast(status === 'approved' ? 'Onaylandı. (Örnek veri: gerçekte hiçbir şey uygulanmadı)' : 'Öneri reddedildi', status === 'approved' ? 'ok' : 'info')
  }

  // "Şimdi güncelle": Supabase Edge Function üzerinden GitHub Actions işini başlatır.
  const triggerUpdate = async () => {
    if (!supabase) return toast('Demo modda veri çekme çalışmaz. README\'deki kurulumu tamamla.', 'warn')
    setUpdating(true)
    const { error } = await supabase.functions.invoke('trigger-update')
    setUpdating(false)
    if (error) toast('Güncelleme başlatılamadı: ' + error.message, 'warn')
    else toast('Veri çekme başladı. Birkaç dakika içinde yenilenir.')
  }

  return (
    <StoreContext.Provider value={{ alerts, resolveAlert, reopenAlert, recs, decide, toasts, toast, triggerUpdate, updating }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('StoreProvider eksik')
  return ctx
}
