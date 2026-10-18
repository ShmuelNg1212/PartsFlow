import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { keys, listMemberships } from '@/api/api'
import type { Membership, Role, Shop } from '@/api/types'
import { useSession } from '@/auth/AuthProvider'
import { ErrorState, LoadingState } from '@/components/app/states'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'partsflow.shop'

type ShopContextValue = {
  shop: Shop
  role: Role
  isOwner: boolean
  memberships: Membership[]
  selectShop: (shopId: string) => void
}

const ShopContext = createContext<ShopContextValue | null>(null)

function readStoredShop(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const memberships = useQuery({ queryKey: keys.memberships, queryFn: () => listMemberships(session.user.id) })
  const [selectedId, setSelectedId] = useState<string | null>(readStoredShop)

  const selectShop = useCallback(
    (shopId: string) => {
      setSelectedId(shopId)
      try {
        localStorage.setItem(STORAGE_KEY, shopId)
      } catch {
        // Private mode: the choice lasts for this tab only.
      }
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'shop' })
    },
    [queryClient],
  )

  const current = useMemo(() => {
    const list = memberships.data ?? []
    return list.find((m) => m.shop.id === selectedId) ?? list[0] ?? null
  }, [memberships.data, selectedId])

  useRealtimeRefresh(current?.shop.id ?? null)

  const value = useMemo<ShopContextValue | null>(
    () =>
      current
        ? { shop: current.shop, role: current.role, isOwner: current.role === 'owner', memberships: memberships.data ?? [], selectShop }
        : null,
    [current, memberships.data, selectShop],
  )

  if (memberships.isPending) {
    return (
      <div className="mx-auto max-w-md p-6">
        <LoadingState rows={3} label="Loading your shop" />
      </div>
    )
  }
  if (memberships.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState error={memberships.error} onRetry={() => memberships.refetch()} title="Could not load your shop" />
      </div>
    )
  }
  if (!value) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="font-heading text-2xl">No shop access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account is not a member of any shop. Ask the shop owner to invite {session.user.email ?? 'this account'}.
        </p>
        <button className="mt-4 text-sm underline underline-offset-4" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    )
  }
  return <ShopContext value={value}>{children}</ShopContext>
}

export function useShop(): ShopContextValue {
  const value = use(ShopContext)
  if (!value) throw new Error('useShop() used outside <ShopProvider>')
  return value
}

/**
 * R-STOCK-3: posted changes show in other open sessions without a reload.
 * Realtime applies RLS to postgres_changes, so a session only hears its own shop.
 */
function useRealtimeRefresh(shopId: string | null) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!shopId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    // One post touches many balance rows; refresh once per burst.
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: keys.shop(shopId) }), 150)
    }
    const channel = supabase
      .channel(`shop:${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_balances', filter: `shop_id=eq.${shopId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `shop_id=eq.${shopId}` }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [shopId, queryClient])
}
