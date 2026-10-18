import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type Values = z.infer<typeof schema>

export function SignInPage() {
  const auth = useAuth()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  if (auth.status === 'signed_in') {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      setServerError(/invalid login credentials/i.test(error.message) ? 'Email or password is wrong.' : errorMessage(error))
    }
  })

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-3xl">PartsFlow</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in with the account your shop owner gave you.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" inputMode="email" {...form.register('email')} aria-invalid={!!form.formState.errors.email} />
            {form.formState.errors.email && <p className="text-sm text-red-fg">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} aria-invalid={!!form.formState.errors.password} />
            {form.formState.errors.password && <p className="text-sm text-red-fg">{form.formState.errors.password.message}</p>}
          </div>
          {serverError && (
            <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
              {serverError}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-6 text-xs text-muted-foreground">There is no public sign-up. The shop owner invites each member.</p>
      </div>
    </div>
  )
}
