// Edge Function: invite-member (plan T3.2, R-ROLE-2, R-DATA-6).
// Deployed with verify_jwt = false: the handler checks the caller's session itself with Auth.
// The secret key stays in this function. It never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleInvite, type InviteDeps } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const secretKey = secretKeys ? JSON.parse(secretKeys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

// Origins the invite link may return to. Set APP_ORIGINS (comma separated) as a function secret for each deployed host.
const allowedOrigins = (Deno.env.get('APP_ORIGINS') ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const deps: InviteDeps = {
  async getUserFromToken(token) {
    const { data, error } = await admin.auth.getUser(token)
    return error || !data.user ? null : { id: data.user.id }
  },
  async isOwner(shopId, userId) {
    const { data, error } = await admin.from('memberships').select('role').eq('shop_id', shopId).eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data?.role === 'owner'
  },
  async findUserIdByEmail(email) {
    const { data, error } = await admin.rpc('user_id_by_email', { p_email: email })
    if (error) throw error
    return (data as string | null) ?? null
  },
  async inviteByEmail(email, redirectTo) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined)
    if (error || !data.user) {
      console.error('invite-member: invite failed', error?.message)
      throw error ?? new Error('no user')
    }
    return data.user.id
  },
  async addMembership(shopId, userId, role) {
    const { error } = await admin.from('memberships').insert({ shop_id: shopId, user_id: userId, role })
    if (error?.code === '23505') return 'already_member'
    if (error) throw error
    return 'added'
  },
  async audit(shopId, actorId, data) {
    const { error } = await admin.from('audit_events').insert({ shop_id: shopId, actor: actorId, kind: 'member.invited', entity: 'shop', entity_id: shopId, data })
    if (error) console.error('invite-member: audit failed', error.message)
  },
}

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  const body = await req.json().catch(() => null)
  const result = await handleInvite({ method: req.method, authorization: req.headers.get('authorization'), origin, body }, deps, { allowedOrigins })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' },
  })
})
