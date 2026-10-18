import { createBrowserRouter } from 'react-router'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/app/AppShell'
import { DocumentPage } from '@/routes/DocumentPage'
import { HistoryPage } from '@/routes/HistoryPage'
import { ImportProductsPage } from '@/routes/ImportProductsPage'
import { InboxPage } from '@/routes/InboxPage'
import { InventoryPage } from '@/routes/InventoryPage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { OverviewPage } from '@/routes/OverviewPage'
import { ProductPage } from '@/routes/ProductPage'
import { SetPasswordPage } from '@/routes/SetPasswordPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { SignInPage } from '@/routes/SignInPage'

// SPA routes. The host must serve index.html for every path (see doc/wiki/setup.md).
export const router = createBrowserRouter([
  { path: '/sign-in', Component: SignInPage },
  {
    Component: RequireAuth,
    children: [
      { path: 'set-password', Component: SetPasswordPage },
      {
        Component: AppShell,
        children: [
          { index: true, Component: OverviewPage },
          { path: 'inbox', Component: InboxPage },
          { path: 'inbox/:id', Component: DocumentPage },
          { path: 'inventory', Component: InventoryPage },
          { path: 'inventory/import', Component: ImportProductsPage },
          { path: 'inventory/:id', Component: ProductPage },
          { path: 'history', Component: HistoryPage },
          { path: 'settings', Component: SettingsPage },
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
])
