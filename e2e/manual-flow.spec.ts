import { expect, test } from '@playwright/test'
import { createProductUI, pickProduct, postDraft, signIn, uniqueSku, visible } from './helpers'

// Plan Phase 2 completion: manual entry → review → confirm → stock lookup, on desktop and phone.
// Rules: R-POST-2, R-POST-3, R-POST-4, R-POST-5, R-STOCK-1, R-STOCK-2, R-UI-1.

test('owner receives 5, sells 2, and sees 3 on hand with both movements', async ({ page }) => {
  const sku = uniqueSku('E2E')
  const description = `E2E brake pad ${sku}`
  await signIn(page, 'owner')
  await createProductUI(page, sku, description)

  // Receipt of 5.
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'New document' }).first().click()
  await page.getByRole('button', { name: /Receive stock/ }).click()
  await page.getByRole('button', { name: 'Enter the lines by hand' }).click()
  await expect(page.getByRole('heading', { name: /Receive stock/ })).toBeVisible()
  await visible(page.getByLabel('Line 1 description')).fill(description)
  await visible(page.getByLabel('Line 1 invoice quantity')).fill('5')
  await visible(page.getByLabel('Line 1 received quantity')).fill('5')
  await pickProduct(page, 1, sku)
  await postDraft(page, /\+5 pc/)
  await expect(page.getByText('+5 pc')).toBeVisible()

  // Sale of 2.
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'New document' }).first().click()
  await page.getByRole('button', { name: /Record a sale/ }).click()
  await page.getByRole('button', { name: 'Enter the lines by hand' }).click()
  await expect(page.getByRole('heading', { name: /Record a sale/ })).toBeVisible()
  await visible(page.getByLabel('Line 1 description')).fill(description)
  await visible(page.getByLabel('Line 1 quantity')).fill('2')
  await pickProduct(page, 1, sku)
  await postDraft(page, /−2 pc/)

  // Inventory shows 3.
  await page.goto(`/inventory?q=${encodeURIComponent(sku)}`)
  const row = visible(page.getByRole('link', { name: new RegExp(description) }))
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByText('On hand')).toBeVisible()
  await expect(page.locator('dd').filter({ hasText: /^3\s*pc/ }).first()).toBeVisible()

  // Both movements are in the history, each linked to its document (R-STOCK-2).
  await expect(visible(page.getByRole('link', { name: /^Receipt/ }))).toBeVisible()
  await expect(visible(page.getByRole('link', { name: /^Sale/ }))).toBeVisible()
  await expect(page.getByText('+5').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('−2').filter({ visible: true }).first()).toBeVisible()
})

test('staff can draft but not post (R-ROLE-1 in the UI)', async ({ page }) => {
  await signIn(page, 'staff')
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'New document' }).first().click()
  await page.getByRole('button', { name: /Record a sale/ }).click()
  await page.getByRole('button', { name: 'Enter the lines by hand' }).click()
  await expect(page.getByText('An owner posts this document.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review and post' })).toHaveCount(0)
  await page.goto('/inventory')
  await expect(page.getByRole('button', { name: 'New product' })).toHaveCount(0)
})
