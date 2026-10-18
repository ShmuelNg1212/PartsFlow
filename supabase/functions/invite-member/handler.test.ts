import { describe, expect, it, vi } from 'vitest'
import { handleInvite, type InviteDeps } from './handler'

// T3.2, R-ROLE-2: only an owner of the shop invites; there is no public sign-up.

const SHOP = '11111111-1111-4111-8111-111111111111'
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function deps(over: Partial<InviteDeps> = {}): InviteDeps {
  return {
    getUserFromToken: vi.fn(async (t: string) => (t === 'good' ? { id: OWNER } : null)),
    isOwner: vi.fn(async () => true),
    findUserIdByEmail: vi.fn(async () => null),
    inviteByEmail: vi.fn(async () => 'new-user-id'),
    addMembership: vi.fn(async () => 'added' as const),
    audit: vi.fn(async () => undefined),
    ...over,
  }
}

const req = (body: unknown, authorization: string | null = 'Bearer good', origin: string | null = 'http://localhost:5173') => ({
  method: 'POST',
  authorization,
  origin,
  body,
})
const opts = { allowedOrigins: ['http://localhost:5173'] }
const valid = { shop_id: SHOP, email: ' New.Staff@Example.com ', role: 'staff' }

describe('handleInvite', () => {
  it('rejects a missing or invalid session', async () => {
    expect((await handleInvite(req(valid, null), deps(), opts)).status).toBe(401)
    expect((await handleInvite(req(valid, 'Bearer bad'), deps(), opts)).status).toBe(401)
  })

  it('rejects other methods', async () => {
    expect((await handleInvite({ ...req(valid), method: 'GET' }, deps(), opts)).status).toBe(405)
  })

  it.each([
    [{ ...valid, email: 'not-an-email' }],
    [{ ...valid, role: 'admin' }],
    [{ ...valid, shop_id: 'x' }],
    [null],
  ])('rejects invalid input %#', async (body) => {
    expect((await handleInvite(req(body), deps(), opts)).status).toBe(400)
  })

  it('refuses a caller who is not an owner of the shop', async () => {
    const d = deps({ isOwner: vi.fn(async () => false) })
    const res = await handleInvite(req(valid), d, opts)
    expect(res.status).toBe(403)
    expect(d.inviteByEmail).not.toHaveBeenCalled()
    expect(d.addMembership).not.toHaveBeenCalled()
  })

  it('invites a new email and adds the membership, with the app as redirect', async () => {
    const d = deps()
    const res = await handleInvite(req(valid), d, opts)
    expect(res).toEqual({ status: 200, body: { status: 'invited', email: 'new.staff@example.com', role: 'staff' } })
    expect(d.inviteByEmail).toHaveBeenCalledWith('new.staff@example.com', 'http://localhost:5173/set-password')
    expect(d.addMembership).toHaveBeenCalledWith(SHOP, 'new-user-id', 'staff')
    expect(d.audit).toHaveBeenCalledWith(SHOP, OWNER, expect.objectContaining({ email: 'new.staff@example.com', role: 'staff', existing_account: false }))
  })

  it('adds an existing account without a new invite', async () => {
    const d = deps({ findUserIdByEmail: vi.fn(async () => 'existing-id') })
    const res = await handleInvite(req({ ...valid, role: 'owner' }), d, opts)
    expect(res.body.status).toBe('added')
    expect(d.inviteByEmail).not.toHaveBeenCalled()
    expect(d.addMembership).toHaveBeenCalledWith(SHOP, 'existing-id', 'owner')
  })

  it('reports an existing member as a conflict', async () => {
    const d = deps({ findUserIdByEmail: vi.fn(async () => 'existing-id'), addMembership: vi.fn(async () => 'already_member' as const) })
    expect((await handleInvite(req(valid), d, opts)).status).toBe(409)
  })

  it('does not pass an unknown origin as redirect', async () => {
    const d = deps()
    await handleInvite(req(valid, 'Bearer good', 'https://evil.example'), d, opts)
    expect(d.inviteByEmail).toHaveBeenCalledWith('new.staff@example.com', undefined)
  })

  it('hides internal errors', async () => {
    const d = deps({ inviteByEmail: vi.fn(async () => Promise.reject(new Error('smtp password wrong'))) })
    const res = await handleInvite(req(valid), d, opts)
    expect(res.status).toBe(502)
    expect(JSON.stringify(res.body)).not.toMatch(/smtp password/)
  })
})
