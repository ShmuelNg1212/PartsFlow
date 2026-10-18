import { Navigate, Outlet, useLocation } from 'react-router'
import { LoadingState } from '@/components/app/states'
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
  return (
    <ShopProvider>
      <Outlet />
    </ShopProvider>
  )
}
