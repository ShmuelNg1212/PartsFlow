import {
  ClockCounterClockwiseIcon,
  GearSixIcon,
  HouseIcon,
  PackageIcon,
  SignOutIcon,
  TrayIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { NavLink, Outlet } from 'react-router'
import { useSession } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useShop } from '@/shop/ShopProvider'
import { ConnectionBanner } from './ConnectionBanner'
import { StatusBadge } from './StatusBadge'

const NAV: { to: string; label: string; icon: Icon; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: HouseIcon, end: true },
  { to: '/inbox', label: 'Invoices', icon: TrayIcon },
  { to: '/inventory', label: 'Inventory', icon: PackageIcon },
  { to: '/history', label: 'History', icon: ClockCounterClockwiseIcon },
  { to: '/settings', label: 'Settings', icon: GearSixIcon },
]

function ShopSwitcher() {
  const { shop, memberships, selectShop, role } = useShop()
  if (memberships.length < 2) {
    return (
      <div className="min-w-0">
        <p title={shop.name} className="truncate text-sm font-medium">{shop.name}</p>
        <p className="text-xs text-muted-foreground capitalize">{role}</p>
      </div>
    )
  }
  return (
    <label className="block min-w-0">
      <span className="sr-only">Shop</span>
      <select
        value={shop.id}
        onChange={(e) => selectShop(e.target.value)}
        className="w-full truncate rounded-md border border-input bg-card px-2 py-1.5 text-sm"
      >
        {memberships.map((m) => (
          <option key={m.shop.id} value={m.shop.id}>
            {m.shop.is_demo ? `Demo shop: ${m.shop.name}` : m.shop.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground capitalize">{role}</span>
    </label>
  )
}

export function AppShell() {
  const session = useSession()
  const { shop } = useShop()
  return (
    <div className="min-h-dvh">
      <ConnectionBanner />
      {shop.is_demo && (
        <div className="bg-blue-bg px-4 py-1.5 text-center text-xs text-blue-fg">
          <StatusBadge tone="blue" className="mr-2 bg-card">Demo shop</StatusBadge>
          Synthetic sample data. It is kept apart from live shop data.
        </div>
      )}
      <div className="md:flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-sidebar p-3 md:flex">
          <div className="px-2 pt-1 pb-4">
            <p className="font-heading text-xl">PartsFlow</p>
          </div>
          <div className="px-2 pb-4">
            <ShopSwitcher />
          </div>
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
                    isActive && 'bg-accent font-medium text-foreground',
                  )
                }
              >
                <Icon className="size-[18px]" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-border px-2 pt-3">
            <p className="truncate text-xs text-muted-foreground" title={session.user.email}>
              {session.user.email}
            </p>
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-2 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <SignOutIcon className="size-4" /> Sign out
            </button>
          </div>
        </aside>

        {/* Phone top bar */}
        <header className="flex items-center justify-between gap-3 border-b border-border bg-sidebar px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:hidden">
          <div className="min-w-0 flex-1">
            <ShopSwitcher />
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex min-h-11 min-w-11 justify-center items-center gap-1.5 text-sm text-muted-foreground"
            aria-label="Sign out"
          >
            <SignOutIcon className="size-5" />
          </button>
        </header>

        <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-10 lg:px-8">
          <Outlet />
        </main>
      </div>

      {/* Phone bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground select-none',
                isActive && 'font-medium text-foreground',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
