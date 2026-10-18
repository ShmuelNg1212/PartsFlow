import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type AuthState = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; session: Session }

const AuthContext = createContext<AuthState>({ status: 'loading' })

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let receivedEvent = false
    let userId: string | null | undefined
    const adopt = (session: Session | null) => {
      if (!active) return
      const nextId = session?.user.id ?? null
      if (userId !== nextId) {
        // Remove in-flight queries and protected data before the next account renders.
        queryClient.clear()
        userId = nextId
      }
      setState(session ? { status: 'signed_in', session } : { status: 'signed_out' })
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!receivedEvent) adopt(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true
      adopt(session)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

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
