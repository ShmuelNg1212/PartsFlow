import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { PASSWORD_SETUP_KEY, supabase } from '@/lib/supabase'

/** Invited members and password resets land here (R-ROLE-2). Signed-in users can also change their password. */
export function SetPasswordPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const tooShort = password.length > 0 && password.length < 10
  const mismatch = confirm.length > 0 && confirm !== password

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (password.length < 10 || password !== confirm) return
          setSaving(true)
          setError(null)
          const { error: err } = await supabase.auth.updateUser({ password })
          setSaving(false)
          if (err) return setError(errorMessage(err))
          try {
            sessionStorage.removeItem(PASSWORD_SETUP_KEY)
          } catch {
            // Nothing stored.
          }
          navigate('/', { replace: true })
        }}
      >
        <div>
          <h1 className="font-heading text-3xl">Set your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">For {session.user.email}. Use at least 10 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={tooShort} />
          {tooShort && <p className="text-sm text-red-fg">Use at least 10 characters.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Repeat the password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
          {mismatch && <p className="text-sm text-red-fg">The passwords are not the same.</p>}
        </div>
        {error && (
          <p role="alert" className="motion-enter rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={saving || password.length < 10 || password !== confirm}>
          {saving ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </div>
  )
}
