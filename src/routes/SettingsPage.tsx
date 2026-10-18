import { PageHeader } from '@/components/app/PageHeader'
import { useShop } from '@/shop/ShopProvider'

// Phase 2: read only. Editing settings and inviting members come in plan T3.2.
export function SettingsPage() {
  const { shop, role } = useShop()
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Shop details." />
      <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {[
          ['Shop name', shop.name],
          ['Currency', shop.currency],
          ['Time zone', shop.timezone],
          ['Your role', role === 'owner' ? 'Owner' : 'Staff'],
          ['Data', shop.is_demo ? 'Demo shop (synthetic data)' : 'Live shop data'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
