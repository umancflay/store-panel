import { useEffect, useSyncExternalStore } from 'react'
import { supabase, isDemo } from './supabase'

// Kim çevrimiçi ve hangi sayfada: Layout bir kez bağlanır, sayfalar usePresence ile okur
export type Online = Record<string, { page: string; at: string }>

let state: Online = {}
const subs = new Set<() => void>()
const set = (s: Online) => {
  state = s
  subs.forEach((f) => f())
}

export function usePresenceTracker(email: string, page: string) {
  useEffect(() => {
    if (isDemo || !supabase || !email) return
    const ch = supabase.channel('ekip', { config: { presence: { key: email } } })
    ch.on('presence', { event: 'sync' }, () => {
      const out: Online = {}
      for (const [k, metas] of Object.entries(ch.presenceState<{ page: string; at: string }>())) out[k] = metas[metas.length - 1]
      set(out)
    }).subscribe((s) => {
      if (s === 'SUBSCRIBED') ch.track({ page: location.hash.slice(1) || '/', at: new Date().toISOString() })
    })
    return () => {
      supabase!.removeChannel(ch)
    }
  }, [email])

  // Sayfa değişince yeni sayfayı bildir
  useEffect(() => {
    if (isDemo || !supabase || !email) return
    const ch = supabase.getChannels().find((c) => c.topic === 'realtime:ekip')
    ch?.track({ page, at: new Date().toISOString() })
  }, [email, page])
}

export function usePresence(): Online {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state)
}
