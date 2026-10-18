import { Navigate, Outlet, useLocation } from 'react-router'
import { LoadingState } from '@/components/app/states'
import { PASSWORD_SETUP_KEY } from '@/lib/supabase'
import { ShopProvider } from '@/shop/ShopProvider'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') {
    return (
      <div className="mx-auto max-w-md p-6">
        <LoadingState rows={2} label="Checking sign-in" />
      </div>
    )
  }
  if (auth.status === 'signed_out') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
  }
  if (needsPassword() && location.pathname !== '/set-password') {
    return <Navigate to="/set-password" replace />
  }
  if (location.pathname === '/set-password') return <Outlet />
  return (
    <ShopProvider>
      <Outlet />
    </ShopProvider>
  )
}

function needsPassword(): boolean {
  try {
    return sessionStorage.getItem(PASSWORD_SETUP_KEY) === '1'
  } catch {
    return false
  }
}
