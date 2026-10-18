// invite-member request logic (plan T3.2, R-ROLE-2). No Deno or npm imports here, so Vitest can test it.
// The caller's session decides who they are; the service role does the privileged work after the owner check.

export type Role = 'owner' | 'staff'

export type InviteDeps = {
  getUserFromToken(token: string): Promise<{ id: string } | null>
  isOwner(shopId: string, userId: string): Promise<boolean>
  findUserIdByEmail(email: string): Promise<string | null>
  /** Sends the invite email and returns the new user id. */
  inviteByEmail(email: string, redirectTo: string | undefined): Promise<string>
  addMembership(shopId: string, userId: string, role: Role): Promise<'added' | 'already_member'>
  audit(shopId: string, actorId: string, data: Record<string, unknown>): Promise<void>
}

export type InviteRequest = { method: string; authorization: string | null; origin: string | null; body: unknown }
export type InviteResponse = { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fail = (status: number, message: string): InviteResponse => ({ status, body: { error: message } })

export async function handleInvite(req: InviteRequest, deps: InviteDeps, opts: { allowedOrigins: string[] }): Promise<InviteResponse> {
  if (req.method !== 'POST') return fail(405, 'Use POST.')

  const token = req.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail(401, 'Sign in first.')
  const caller = await deps.getUserFromToken(token).catch(() => null)
  if (!caller) return fail(401, 'Your session has expired. Sign in again.')

  const body = (req.body ?? {}) as Record<string, unknown>
  const shopId = typeof body.shop_id === 'string' ? body.shop_id : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body.role
  if (!UUID.test(shopId)) return fail(400, 'Shop is missing.')
  if (!EMAIL.test(email) || email.length > 254) return fail(400, 'Enter a valid email address.')
  if (role !== 'owner' && role !== 'staff') return fail(400, 'Role must be owner or staff.')

  if (!(await deps.isOwner(shopId, caller.id).catch(() => false))) {
    return fail(403, 'Only an owner of this shop can invite members.')
  }

  const redirectTo = req.origin && opts.allowedOrigins.includes(req.origin) ? `${req.origin}/set-password` : undefined

  try {
    const existing = await deps.findUserIdByEmail(email)
    const userId = existing ?? (await deps.inviteByEmail(email, redirectTo))
    const result = await deps.addMembership(shopId, userId, role)
    if (result === 'already_member') return fail(409, 'This person is already a member of the shop.')
    await deps.audit(shopId, caller.id, { email, role, existing_account: !!existing })
    return { status: 200, body: { status: existing ? 'added' : 'invited', email, role } }
  } catch {
    // Details stay in the function logs; the client gets a plain message.
    return fail(502, 'The invite could not be sent. Check the email settings of the project and try again.')
  }
}
