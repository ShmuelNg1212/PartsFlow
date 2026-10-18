import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { admin, balanceOf, connectAs, createDraft, createProduct, seedShop } from './helpers'

it('R-POST-9: concurrent copies require a duplicate override', async () => {
  const f = await seedShop()
  const productId = await createProduct(f)
  const first = await createDraft(f.owner, f.shopId, 'receipt', [{ productId }], { docNumber: 'SAME-INVOICE' })
  const second = await createDraft(f.owner, f.shopId, 'receipt', [{ productId }], { docNumber: 'SAME-INVOICE' })
  const other = await connectAs(f.ownerId)
  const { rows: [{ pid }] } = await other.query('select pg_backend_pid() as pid')
  await f.owner.query('begin')
  let outcome: Promise<{ code: string } | null> | undefined
  try {
    await f.owner.query('select public.post_document($1,$2)', [first, randomUUID()])
    outcome = other.query('select public.post_document($1,$2)', [second, randomUUID()]).then(() => null, err => ({ code: err.code }))
    const db = await admin()
    await expect.poll(async () => (await db.query('select cardinality(pg_blocking_pids($1)) as blockers', [pid])).rows[0].blockers).toBeGreaterThan(0)
  } finally {
    await f.owner.query('commit')
  }
  expect(await outcome).toEqual({ code: 'PF002' })
  expect(await balanceOf(productId)).toBe('1.000')
})

it('R-POST-10: a direct line edit cannot change the posted document during posting', async () => {
  const f = await seedShop()
  const productId = await createProduct(f)
  const id = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '5' }])
  const { rows: [{ pid }] } = await f.staff.query('select pg_backend_pid() as pid')
  await f.owner.query('begin')
  let outcome: Promise<{ code: string } | null> | undefined
  try {
    await f.owner.query('select public.post_document($1,$2)', [id, randomUUID()])
    outcome = f.staff.query('update public.document_lines set received_quantity=99 where document_id=$1', [id]).then(() => null, err => ({ code: err.code }))
    const db = await admin()
    // The old guard finishes immediately; a correct guard waits for the parent lock.
    await expect.poll(async () => (await db.query("select state from pg_stat_activity where pid=$1", [pid])).rows[0]?.state).toMatch(/active|idle/)
    await db.query('select pg_sleep(0.1)')
  } finally {
    await f.owner.query('commit')
  }
  expect(await outcome).toEqual({ code: '55000' })
  const db = await admin()
  expect((await db.query('select received_quantity::text as qty from public.document_lines where document_id=$1', [id])).rows[0].qty).toBe('5.000')
  expect(await balanceOf(productId)).toBe('5.000')
})

it('pilot measurement: concurrent first opens record one event', async () => {
  const f = await seedShop()
  const id = await createDraft(f.owner, f.shopId, 'receipt', [])
  await f.owner.query('begin')
  let other: Promise<unknown> | undefined
  try {
    await f.owner.query('select public.record_document_opened($1)', [id])
    other = f.staff.query('select public.record_document_opened($1)', [id])
    await (await admin()).query('select pg_sleep(0.1)')
  } finally {
    await f.owner.query('commit')
  }
  await other
  const rows = await (await admin()).query("select id from public.audit_events where kind='document.opened' and entity_id=$1", [id])
  expect(rows.rowCount).toBe(1)
})
