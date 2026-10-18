import { expect, test } from '@playwright/test'
import { apiAs, signIn, uniqueSku } from './helpers'

// R-POST-10 reversal and R-POST-9 duplicate review through the UI. Data arranged as "another session" via the API.

async function arrange(direction: 'receipt' | 'sale', qty: string, opts: { docNumber?: string; counterpartyName?: string; post?: boolean; opening?: string } = {}) {
  const { sb, shopId } = await apiAs('owner')
  const sku = uniqueSku('RV')
  const product = await sb.from('products').insert({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `Reversal part ${sku}`, brand: 'NGK' }).select('id').single()
  const productId = product.data!.id as string
  if (opts.opening) await sb.rpc('set_opening_quantity', { p_product_id: productId, p_qty: opts.opening as unknown as number })
  let counterpartyId: string | null = null
  if (opts.counterpartyName) {
    const cp = await sb.from('counterparties').insert({ shop_id: shopId, kind: direction === 'receipt' ? 'supplier' : 'customer', name: opts.counterpartyName }).select('id').single()
    counterpartyId = cp.data!.id
  }
  const makeDoc = async () => {
    const doc = await sb.from('documents').insert({ shop_id: shopId, direction, doc_number: opts.docNumber ?? null, counterparty_id: counterpartyId }).select('id, updated_at').single()
    await sb.rpc('save_draft', {
      p_document_id: doc.data!.id,
      p_expected_updated_at: doc.data!.updated_at,
      p_header: {},
      p_lines: [{ description: 'Line', quantity: qty, received_quantity: direction === 'receipt' ? qty : null, product_id: productId }],
    })
    return doc.data!.id as string
  }
  return { sb, productId, sku, makeDoc }
}

test('owner reverses a posted receipt with a reason and stock is restored', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  const { sb, productId, makeDoc } = await arrange('receipt', '6', { opening: '1' })
  const docId = await makeDoc()
  await sb.rpc('post_document', { p_document_id: docId, p_idempotency_key: crypto.randomUUID() })

  await signIn(page, 'owner')
  await page.goto(`/inbox/${docId}`)
  await page.getByRole('button', { name: 'Reverse' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Reverse document' })).toBeDisabled()
  await dialog.getByLabel('Reason (required)').fill('Delivery was refused at the door')
  await dialog.getByRole('button', { name: 'Reverse document' }).click()
  await expect(page.getByText(/Reversed .*Reason: Delivery was refused at the door/)).toBeVisible()

  await page.goto(`/inventory/${productId}`)
  await expect(page.locator('dd').filter({ hasText: /^1\s*pc/ }).first()).toBeVisible()
  await expect(page.getByText('Delivery was refused at the door').first()).toBeVisible()
})

test('a duplicate invoice needs an owner reason before it posts', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  const number = uniqueSku('INV')
  const { sb, productId, makeDoc } = await arrange('receipt', '2', { docNumber: number, counterpartyName: `Supplier ${number}` })
  const first = await makeDoc()
  await sb.rpc('post_document', { p_document_id: first, p_idempotency_key: crypto.randomUUID() })
  const second = await makeDoc()

  await signIn(page, 'owner')
  await page.goto(`/inbox/${second}`)
  await page.getByRole('button', { name: 'Review and post' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(dialog.getByText('Possible duplicate. Not posted.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Post anyway' })).toBeDisabled()
  await dialog.getByLabel(/Post anyway: reason/).fill('Second delivery under the same invoice number')
  await dialog.getByRole('button', { name: 'Post anyway' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/Posted despite a duplicate warning/)).toBeVisible()

  const balance = await sb.from('product_stock').select('qty').eq('id', productId).single()
  expect(balance.data!.qty).toBe('4')
})
