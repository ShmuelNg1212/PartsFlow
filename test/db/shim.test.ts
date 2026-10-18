import { describe, expect, it } from 'vitest'
import { connectAs, createUser } from './helpers'

describe('test shim', () => {
  it('auth.uid() returns the acting user id under role authenticated', async () => {
    const userId = await createUser()
    const actor = await connectAs(userId)
    const { rows } = await actor.query('select auth.uid() as uid, current_user as role')
    expect(rows[0]).toEqual({ uid: userId, role: 'authenticated' })
  })

  it('auth.uid() is null for anon', async () => {
    const actor = await connectAs(null)
    const { rows } = await actor.query('select auth.uid() as uid, current_user as role')
    expect(rows[0]).toEqual({ uid: null, role: 'anon' })
  })
})
