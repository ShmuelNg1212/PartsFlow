import { expect, test } from '@playwright/test'
import { apiAs, pickProduct, postDraft, signIn, uniqueSku, visible } from './helpers'

// Rendezvous: staff drafts a sale; owner posts; a separate staff session receives the balance.
test('R-ROLE-1 / R-STOCK-3: staff draft reaches owner posting and live stock', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'Cross-session check; manual-flow covers both layouts.')
  const { sb, shopId } = await apiAs('owner')
  const sku = uniqueSku('FIRST')
  const created = await sb.from('products').insert({ shop_id: shopId, sku, part_number: sku, description: `First-use part ${sku}`, brand: 'NGK' }).select('id').single()
  expect(created.error).toBeNull()
  const productId = created.data!.id
  expect((await sb.rpc('set_opening_quantity', { p_product_id: productId, p_qty: '5' })).error).toBeNull()
  const ownerContext = await browser.newContext()
  try {
    await signIn(page, 'staff')
    await page.goto('/inbox')
    await page.getByRole('button', { name: 'New document' }).first().click()
    await page.getByRole('button', { name: /Record a sale/ }).click()
    await page.getByRole('button', { name: 'Enter the lines by hand' }).click()
    await visible(page.getByLabel('Line 1 description')).fill(`First-use part ${sku}`)
    await visible(page.getByLabel('Line 1 quantity')).fill('2')
    await pickProduct(page, 1, sku)
    await page.getByRole('button', { name: /Save draft/ }).click()
    await expect(page.getByText('All changes saved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review and post' })).toHaveCount(0)
    const draftUrl = page.url()
    await page.goto(`/inventory/${productId}`)
    await expect(page.locator('dd').filter({ hasText: /^5\s*pc/ }).first()).toBeVisible()
    const owner = await ownerContext.newPage()
    await signIn(owner, 'owner')
    await owner.goto(draftUrl)
    await expect(owner.getByRole('heading', { name: /Record a sale/ })).toBeVisible()
    await postDraft(owner, /−2 pc/)
    await expect(page.locator('dd').filter({ hasText: /^3\s*pc/ }).first()).toBeVisible({ timeout: 15_000 })
  } finally {
    await ownerContext.close()
  }
})
