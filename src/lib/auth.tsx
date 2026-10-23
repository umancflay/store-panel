import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isDemo } from './supabase'

// Girişin aşamaları:
// signedOut  → e-posta + şifre
// enroll     → ilk girişte iki adımlı doğrulama kurulumu (QR kod)
// verify     → her girişte 6 haneli kod
// denied     → hesap admins tablosunda değil
// ready      → panel açık
type Stage = 'loading' | 'signedOut' | 'enroll' | 'verify' | 'denied' | 'ready'

interface AuthState {
  stage: Stage
  email: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  demoSignIn: (email: string) => void
}

const AuthContext = createContext<AuthState | null>(null)
const DEMO_KEY = 'store-panel-demo-user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('loading')
  const [email, setEmail] = useState<string | null>(null)

  const evaluate = useCallback(async (session: Session | null) => {
    if (!supabase) return
    if (!session) {
      setEmail(null)
      return setStage('signedOut')
    }
    setEmail(session.user.email ?? null)

    const { data: listed } = await supabase.rpc('am_i_listed')
    if (!listed) return setStage('denied')

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') return setStage('ready')
    setStage(aal?.nextLevel === 'aal2' ? 'verify' : 'enroll')
  }, [])

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await evaluate(data.session)
  }, [evaluate])

  useEffect(() => {
    if (isDemo) {
      let saved: string | null = null
      try {
        saved = sessionStorage.getItem(DEMO_KEY)
      } catch {
        /* depolama kapalı olabilir */
      }
      setEmail(saved)
      setStage(saved ? 'ready' : 'signedOut')
      return
    }
    refresh()
    const { data } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') setTimeout(() => evaluate(session), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [refresh, evaluate])

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    try {
      sessionStorage.removeItem(DEMO_KEY)
    } catch {
      /* yok say */
    }
    setEmail(null)
    setStage('signedOut')
  }

  const demoSignIn = (mail: string) => {
    try {
      sessionStorage.setItem(DEMO_KEY, mail)
    } catch {
      /* yok say */
    }
    setEmail(mail)
    setStage('ready')
  }

  return <AuthContext.Provider value={{ stage, email, refresh, signOut, demoSignIn }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider eksik')
  return ctx
}
