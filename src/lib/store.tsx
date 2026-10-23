import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Alert, Recommendation } from '../data/sample'
import { supabase } from './supabase'
import { useData } from './data'

// Uygulama genelinde paylaşılan durum: uyarılar, onay bekleyen öneriler ve bildirim balonları.
// Gerçek modda değişiklikler Supabase'e yazılır; demo modda sadece bu oturumda tutulur.

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
  const data = useData()
  const [alerts, setAlerts] = useState(data.alerts)
  const [recs, setRecs] = useState(data.recs)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [updating, setUpdating] = useState(false)

  // Veri yüklendiğinde/yenilendiğinde listeleri güncelle
  useEffect(() => setAlerts(data.alerts), [data.alerts])
  useEffect(() => setRecs(data.recs), [data.recs])

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const setAlertStatus = async (id: number, status: Alert['status'], msg: string) => {
    setAlerts((list) => list.map((a) => (a.id === id ? { ...a, status } : a)))
    if (!data.demo && supabase) {
      const { data: user } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('alerts')
        .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null, resolved_by: status === 'resolved' ? user.user?.email : null })
        .eq('id', id)
      if (error) return toast('Kaydedilemedi: ' + error.message, 'warn')
    }
    toast(msg, status === 'resolved' ? 'ok' : 'info')
  }

  const resolveAlert = (id: number) => setAlertStatus(id, 'resolved', 'Uyarı çözüldü olarak işaretlendi')
  const reopenAlert = (id: number) => setAlertStatus(id, 'open', 'Uyarı yeniden açıldı')

  // Onay sadece kararı kaydeder. Uygulama işini GitHub Actions yapar (5. ve 6. aşama),
  // ve sadece "approved" durumundaki önerileri uygular.
  const decide = async (id: number, status: 'approved' | 'rejected') => {
    setRecs((list) => list.map((r) => (r.id === id ? { ...r, status } : r)))
    if (!data.demo && supabase) {
      const { data: user } = await supabase.auth.getUser()
      const { error } = await supabase.from('recommendations').update({ status, decided_by: user.user?.email, decided_at: new Date().toISOString() }).eq('id', id)
      if (error) return toast('Kaydedilemedi: ' + error.message, 'warn')
    }
    if (status === 'rejected') toast('Öneri reddedildi', 'info')
    else toast(data.demo ? 'Onaylandı. (Demo: gerçekte hiçbir şey uygulanmadı)' : 'Onaylandı. Bir sonraki çalışmada uygulanacak.')
  }

  // "Şimdi güncelle": Supabase Edge Function üzerinden GitHub Actions işini başlatır.
  const triggerUpdate = async () => {
    if (!supabase) return toast('Demo modda veri çekme çalışmaz. README\'deki kurulumu tamamla.', 'warn')
    setUpdating(true)
    const { error } = await supabase.functions.invoke('trigger-update')
    setUpdating(false)
    if (error) toast('Güncelleme başlatılamadı. README › Adım 11\'deki "Şimdi güncelle" kurulumu yapılmamış olabilir.', 'warn')
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
