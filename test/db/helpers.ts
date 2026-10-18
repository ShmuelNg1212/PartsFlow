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

export type ShopFixture = {
  shopId: string
  ownerId: string
  staffId: string
  outsiderId: string
  owner: Actor
  staff: Actor
  outsider: Actor
  anon: Actor
}

/** A shop with one owner and one staff member, an unrelated signed-in user, and an anon connection. */
export async function seedShop(opts: { isDemo?: boolean } = {}): Promise<ShopFixture> {
  const db = await admin()
  const [ownerId, staffId, outsiderId] = await Promise.all([createUser('owner'), createUser('staff'), createUser('outsider')])
  const { rows } = await db.query(
    `insert into public.shops (name, is_demo) values ($1, $2) returning id`,
    [`Test shop ${ownerId.slice(0, 6)}`, opts.isDemo ?? false],
  )
  const shopId = rows[0].id as string
  await db.query(
    `insert into public.memberships (shop_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'staff')`,
    [shopId, ownerId, staffId],
  )
  const [owner, staff, outsider, anon] = await Promise.all([
    connectAs(ownerId),
    connectAs(staffId),
    connectAs(outsiderId),
    connectAs(null),
  ])
  return { shopId, ownerId, staffId, outsiderId, owner, staff, outsider, anon }
}

type ProductInput = {
  sku?: string
  partNumber?: string
  description?: string
  brand?: string
  baseUnit?: string
  sellingPrice?: string
  reorderThreshold?: string
}

/** Inserts a product as the shop owner (through RLS) and returns its id. */
export async function createProduct(f: ShopFixture, p: ProductInput = {}): Promise<string> {
  const suffix = randomUUID().slice(0, 6)
  const { rows } = await f.owner.query(
    `insert into public.products (shop_id, sku, part_number, description, brand, base_unit, selling_price, reorder_threshold)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      f.shopId,
      p.sku ?? `SKU-${suffix}`,
      p.partNumber ?? `PN-${suffix}`,
      p.description ?? `Test part ${suffix}`,
      p.brand ?? 'Bosch',
      p.baseUnit ?? 'pc',
      p.sellingPrice ?? '100.00',
      p.reorderThreshold ?? '2',
    ],
  )
  return rows[0].id as string
}

type LineInput = {
  productId?: string | null
  quantity?: string
  receivedQuantity?: string | null
  unit?: string | null
  conversionFactor?: string | null
  unitPrice?: string
  description?: string
  partNumber?: string
}

/** Creates a draft document with lines as the given actor (through RLS) and returns its id. */
export async function createDraft(
  actor: Actor,
  shopId: string,
  direction: 'receipt' | 'sale',
  lines: LineInput[],
  header: { docNumber?: string | null; counterpartyId?: string | null } = {},
): Promise<string> {
  const { rows } = await actor.query(
    `insert into public.documents (shop_id, direction, doc_number, counterparty_id) values ($1, $2, $3, $4) returning id`,
    [shopId, direction, header.docNumber ?? null, header.counterpartyId ?? null],
  )
  const documentId = rows[0].id as string
  let lineNo = 1
  for (const l of lines) {
    await actor.query(
      `insert into public.document_lines
         (document_id, line_no, product_id, description, part_number, quantity, received_quantity, unit, conversion_factor, unit_price)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        documentId,
        lineNo++,
        l.productId ?? null,
        l.description ?? 'Line',
        l.partNumber ?? null,
        l.quantity ?? '1',
        l.receivedQuantity === undefined ? (direction === 'receipt' ? (l.quantity ?? '1') : null) : l.receivedQuantity,
        l.unit ?? null,
        l.conversionFactor ?? null,
        l.unitPrice ?? '0',
      ],
    )
  }
  return documentId
}

/** Reads a product balance with the superuser connection, as a decimal string. */
export async function balanceOf(productId: string): Promise<string> {
  const db = await admin()
  const { rows } = await db.query(`select coalesce((select qty from public.product_balances where product_id = $1), 0)::text as qty`, [productId])
  return rows[0].qty as string
}
