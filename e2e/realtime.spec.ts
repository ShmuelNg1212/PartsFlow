import { expect, test } from '@playwright/test'
import { apiAs, signIn, uniqueSku } from './helpers'

// T2.6 / R-STOCK-3: a post in another session updates an open page without a reload.
test('a post elsewhere updates the open product page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One viewport is enough for the realtime check.')
  const { sb, shopId } = await apiAs('owner')
  const sku = uniqueSku('RT')
  const product = await sb
    .from('products')
    .insert({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `Realtime part ${sku}`, brand: 'Denso' })
    .select('id')
    .single()
  expect(product.error).toBeNull()
  const productId = product.data!.id as string

  await signIn(page, 'staff')
  await page.goto(`/inventory/${productId}`)
  await expect(page.locator('dd').filter({ hasText: /^0\s*pc/ }).first()).toBeVisible()
  // Let the realtime channel finish subscribing.
  await page.waitForTimeout(1500)

  const doc = await sb.from('documents').insert({ shop_id: shopId, direction: 'receipt' }).select('id, updated_at').single()
  const saved = await sb.rpc('save_draft', {
    p_document_id: doc.data!.id,
    p_expected_updated_at: doc.data!.updated_at,
    p_header: {},
    p_lines: [{ description: 'Realtime line', quantity: '4', received_quantity: '4', product_id: productId }],
  })
  expect(saved.error).toBeNull()
  const posted = await sb.rpc('post_document', { p_document_id: doc.data!.id, p_idempotency_key: crypto.randomUUID() })
  expect(posted.error).toBeNull()

  // No reload: the page must change by itself.
  await expect(page.locator('dd').filter({ hasText: /^4\s*pc/ }).first()).toBeVisible({ timeout: 15_000 })
})
