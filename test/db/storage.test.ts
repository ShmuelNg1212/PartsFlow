import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T1.5: private bucket "documents", path {shop_id}/{document_id}/{file}. R-DOC-1, R-DATA-5.
// The shim's storage.objects stands in for the Storage API, which runs these queries as the caller's role.

let f: ShopFixture
let documentId: string
let path: string

const insertObject = (actor: ShopFixture['owner'], name: string) =>
  actor.query(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, auth.uid())`, [name])

beforeAll(async () => {
  f = await seedShop()
  const productId = await createProduct(f)
  documentId = await createDraft(f.staff, f.shopId, 'receipt', [{ productId, quantity: '1' }])
  path = `${f.shopId}/${documentId}/invoice.pdf`
  await insertObject(f.staff, path)
})

describe('documents bucket', () => {
  it('is private', async () => {
    const db = await admin()
    const { rows } = await db.query(`select public from storage.buckets where id = 'documents'`)
    expect(rows).toEqual([{ public: false }])
  })

  it('lets members read files of their shop', async () => {
    for (const actor of [f.owner, f.staff]) {
      const { rows } = await actor.query(`select name from storage.objects where name = $1`, [path])
      expect(rows).toHaveLength(1)
    }
  })

  it('hides files from outsiders and anon', async () => {
    for (const actor of [f.outsider, f.anon]) {
      const { rows } = await actor.query(`select name from storage.objects where bucket_id = 'documents'`)
      expect(rows).toEqual([])
    }
  })

  it('refuses uploads into another shop path', async () => {
    const err = await expectError(insertObject(f.outsider, `${f.shopId}/${documentId}/evil.pdf`))
    expect(err.code).toBe('42501')
    const anonErr = await expectError(insertObject(f.anon, `${f.shopId}/${documentId}/evil.pdf`))
    expect(anonErr.code).toBe('42501')
  })

  it('refuses a path whose document belongs to another shop', async () => {
    const other = await seedShop()
    const otherProduct = await createProduct(other)
    const otherDoc = await createDraft(other.owner, other.shopId, 'receipt', [{ productId: otherProduct, quantity: '1' }])
    const err = await expectError(insertObject(f.owner, `${f.shopId}/${otherDoc}/mixed.pdf`))
    expect(err.code).toBe('42501')
  })

  it('refuses malformed paths without a server error', async () => {
    for (const name of ['not-a-uuid/file.pdf', `${f.shopId}/file.pdf`, `${f.shopId}/${randomUUID()}/file.pdf`]) {
      const err = await expectError(insertObject(f.owner, name))
      expect(err.code, name).toBe('42501')
    }
  })

  it('never lets clients change or delete stored files (R-DOC-1)', async () => {
    const upd = await f.owner.query(`update storage.objects set name = name || '.x' where name = $1`, [path])
    expect(upd.rowCount).toBe(0)
    const del = await f.owner.query(`delete from storage.objects where name = $1`, [path])
    expect(del.rowCount).toBe(0)
  })

  it('refuses uploads to a posted document', async () => {
    const productId = await createProduct(f)
    const posted = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await f.owner.query('select public.post_document($1, $2)', [posted, randomUUID()])
    const err = await expectError(insertObject(f.owner, `${f.shopId}/${posted}/late.pdf`))
    expect(err.code).toBe('42501')
  })
})
