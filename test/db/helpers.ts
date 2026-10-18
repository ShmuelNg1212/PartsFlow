import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, inject } from 'vitest'

// Connections "as owner", "as staff", "as outsider", "as anon".
// Each actor gets its own connection with the API role and JWT claims set for the session,
// so grants and RLS apply the way they do behind PostgREST.

const dbUrl = () => inject('dbUrl')

const open: pg.Client[] = []
let adminClient: pg.Client | undefined

afterAll(async () => {
  await Promise.all(open.splice(0).map((c) => c.end().catch(() => undefined)))
  if (adminClient) {
    await adminClient.end().catch(() => undefined)
    adminClient = undefined
  }
})

/** Superuser connection. Bypasses RLS. Use only to arrange fixtures and to inspect results. */
export async function admin(): Promise<pg.Client> {
  if (!adminClient) {
    adminClient = new pg.Client({ connectionString: dbUrl() })
    await adminClient.connect()
  }
  return adminClient
}

export type Actor = pg.Client & { userId: string | null }

/** A connection that acts as the given user (role authenticated), or as anon when userId is null. */
export async function connectAs(userId: string | null): Promise<Actor> {
  const client = new pg.Client({ connectionString: dbUrl() }) as Actor
  await client.connect()
  open.push(client)
  const role = userId ? 'authenticated' : 'anon'
  const claims = userId ? { sub: userId, role } : { role }
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)])
  await client.query(`set role ${role}`)
  client.userId = userId
  return client
}

export async function createUser(label = 'user'): Promise<string> {
  const db = await admin()
  const id = randomUUID()
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${label}-${id.slice(0, 8)}@test.local`])
  return id
}

/** Runs a statement and returns the Postgres error, or fails the test when the statement succeeds. */
export async function expectError(promise: Promise<unknown>): Promise<pg.DatabaseError> {
  try {
    await promise
  } catch (err) {
    return err as pg.DatabaseError
  }
  throw new Error('Expected the statement to fail, but it succeeded')
}
