import type { Session } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type AuthState = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; session: Session }

const AuthContext = createContext<AuthState>({ status: 'loading' })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? { status: 'signed_in', session: data.session } : { status: 'signed_out' })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signed_in', session } : { status: 'signed_out' })
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext value={state}>{children}</AuthContext>
}

export function useAuth() {
  return use(AuthContext)
}

/** The signed-in session. Use only below <RequireAuth>. */
export function useSession(): Session {
  const state = useAuth()
  if (state.status !== 'signed_in') throw new Error('useSession() used outside a signed-in route')
  return state.session
}
