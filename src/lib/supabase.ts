import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.')
}

// Invite and password-recovery links arrive with "type=invite" or "type=recovery" in the URL hash.
// supabase-js consumes the hash on start, so note the type first: the app then asks for a new password.
export const PASSWORD_SETUP_KEY = 'partsflow.needs-password'
if (typeof window !== 'undefined' && /(^|[#&])type=(invite|recovery)(&|$)/.test(window.location.hash)) {
  try {
    sessionStorage.setItem(PASSWORD_SETUP_KEY, '1')
  } catch {
    // Without storage the user can still set a password from Settings.
  }
}

// Browser client. Uses only the publishable key; the database enforces every rule (R-ROLE-1, R-DATA-6).
export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
