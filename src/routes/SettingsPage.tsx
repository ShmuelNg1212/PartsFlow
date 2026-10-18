import { DownloadSimpleIcon, UserPlusIcon } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { inviteMember, keys, listMembers, updateShop } from '@/api/api'
import { PageHeader } from '@/components/app/PageHeader'
import { ErrorState, LoadingState } from '@/components/app/states'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { exportDocumentMetrics, exportDocuments, exportMovements, exportProducts } from '@/features/export/exports'
import { downloadText } from '@/lib/download'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useShop } from '@/shop/ShopProvider'

const TIME_ZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Manila', 'UTC']

export function SettingsPage() {
  const { shop, isOwner } = useShop()
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Settings" description={isOwner ? 'Shop details and members.' : 'Shop details and members. Only an owner can change them.'} />
      {isOwner ? <ShopForm key={shop.id + shop.name + shop.currency + shop.timezone} /> : <ShopFacts />}
      <Members />
      <ExportSection />
      <section>
        <h2 className="mb-2 text-lg font-medium">Your account</h2>
        <Link to="/set-password" className="text-sm underline underline-offset-4">
          Change your password
        </Link>
      </section>
    </div>
  )
}

function ShopFacts() {
  const { shop } = useShop()
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {[
        ['Shop name', shop.name],
        ['Currency', shop.currency],
        ['Time zone', shop.timezone],
        ['Data', shop.is_demo ? 'Demo shop (synthetic data)' : 'Live shop data'],
      ].map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** D1: owners change name, currency, and time zone. */
function ShopForm() {
  const { shop } = useShop()
  const queryClient = useQueryClient()
  const [name, setName] = useState(shop.name)
  const [currency, setCurrency] = useState(shop.currency)
  const [timezone, setTimezone] = useState(shop.timezone)
  const currencyValid = /^[A-Z]{3}$/.test(currency)
  const dirty = name.trim() !== shop.name || currency !== shop.currency || timezone !== shop.timezone
  const save = useMutation({
    mutationFn: () => updateShop(shop.id, { name: name.trim(), currency, timezone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.memberships() })
      toast.success('Settings saved.')
    },
  })
  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty && currencyValid && name.trim()) save.mutate()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="shop-name">Shop name</Label>
        <Input id="shop-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="text-base sm:text-sm" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="shop-currency">Currency (ISO code)</Label>
          <Input
            id="shop-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            className="num text-base sm:text-sm"
            aria-invalid={!currencyValid}
          />
          {!currencyValid && <p className="text-sm text-red-fg">Use a three-letter code, for example PHP.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shop-timezone">Time zone</Label>
          <select id="shop-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-base sm:text-sm">
            {(TIME_ZONES.includes(timezone) ? TIME_ZONES : [timezone, ...TIME_ZONES]).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Used for daily totals and dates.</p>
        </div>
      </div>
      {save.isError && (
        <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
          {errorMessage(save.error)}
        </p>
      )}
      <Button type="submit" disabled={!dirty || !currencyValid || !name.trim() || save.isPending}>
        {save.isPending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  )
}

function Members() {
  const { shop, isOwner } = useShop()
  const [inviting, setInviting] = useState(false)
  const members = useQuery({ queryKey: [...keys.shop(shop.id), 'members'], queryFn: () => listMembers(shop.id) })
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Members</h2>
        {isOwner && (
          <Button variant="outline" onClick={() => setInviting(true)}>
            <UserPlusIcon /> Invite member
          </Button>
        )}
      </div>
      {members.isPending ? (
        <LoadingState rows={2} />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {members.data.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate">{m.email}</p>
                <p className="text-xs text-muted-foreground">
                  {m.last_sign_in_at ? `Last signed in ${formatDateTime(m.last_sign_in_at, shop.timezone)}` : 'Has not signed in yet'}
                </p>
              </div>
              <StatusBadge tone={m.role === 'owner' ? 'blue' : 'neutral'}>{m.role}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
      {isOwner && <InviteDialog open={inviting} onOpenChange={setInviting} />}
    </section>
  )
}

/** R-ROLE-2: owners invite members; there is no public sign-up. */
function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { shop } = useShop()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'staff'>('staff')
  const invite = useMutation({
    mutationFn: () => inviteMember(shop.id, email.trim(), role),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: [...keys.shop(shop.id), 'members'] })
      toast.success(r.status === 'invited' ? `Invite sent to ${r.email}.` : `${r.email} already had an account and is now a member.`)
      setEmail('')
      onOpenChange(false)
    },
  })
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  return (
    <Dialog open={open} onOpenChange={(o) => !invite.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>PartsFlow emails a link. The person sets a password and joins {shop.name}.</DialogDescription>
        </DialogHeader>
        <form
          id="invite-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) invite.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="text-base sm:text-sm" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Role</legend>
            {(
              [
                ['staff', 'Staff', 'Searches stock, creates and edits drafts, uploads documents.'],
                ['owner', 'Owner', 'Also posts and reverses documents, edits products, and changes settings.'],
              ] as const
            ).map(([value, label, text]) => (
              <label key={value} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-foreground">
                <input type="radio" name="invite-role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-1" />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{text}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </form>
        {invite.isError && (
          <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
            {errorMessage(invite.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" disabled={!valid || invite.isPending}>
            {invite.isPending ? 'Sending…' : 'Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const EXPORTS = [
  { id: 'products', label: 'Products and stock on hand', run: exportProducts, ownerOnly: false },
  { id: 'movements', label: 'Stock movements (ledger)', run: exportMovements, ownerOnly: false },
  { id: 'documents', label: 'Documents', run: exportDocuments, ownerOnly: false },
  // T6.1: raw pilot counts per posted document. The server refuses non-owners.
  { id: 'pilot-measurements', label: 'Pilot measurements', run: exportDocumentMetrics, ownerOnly: true },
] as const

/** R-ACT-1: basic CSV export. Quantities and money are exact decimals. */
function ExportSection() {
  const { shop, isOwner } = useShop()
  const exporter = useMutation({
    mutationFn: async (id: (typeof EXPORTS)[number]['id']) => {
      const item = EXPORTS.find((e) => e.id === id)!
      const csv = await item.run(shop.id)
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: shop.timezone }).format(new Date())
      downloadText(`partsflow-${id}-${date}.csv`, csv)
    },
  })
  return (
    <section>
      <h2 className="mb-1 text-lg font-medium">Export</h2>
      <p className="mb-3 text-sm text-muted-foreground">CSV files for a spreadsheet or your accountant. Times are in UTC.</p>
      <div className="flex flex-wrap gap-2">
        {EXPORTS.filter((e) => isOwner || !e.ownerOnly).map((e) => (
          <Button key={e.id} variant="outline" disabled={exporter.isPending} onClick={() => exporter.mutate(e.id)}>
            <DownloadSimpleIcon /> {exporter.isPending && exporter.variables === e.id ? 'Preparing…' : e.label}
          </Button>
        ))}
      </div>
      {exporter.isError && (
        <p role="alert" className="mt-2 rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
          {errorMessage(exporter.error)}
        </p>
      )}
    </section>
  )
}
