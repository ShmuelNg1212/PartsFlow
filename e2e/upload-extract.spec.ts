import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { apiAs, pickProduct, signIn, uniqueSku, visible } from './helpers'

// Phase 4: capture → extraction (demo) → review → post. R-DOC-1, R-DOC-4, R-DOC-5, R-EXT-3, R-EXT-4, R-POST-9.

const SAMPLE = 'public/samples/sample-invoice-bayan-0412.png'

async function startReceiptWithFile(page: import('@playwright/test').Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'New document' }).first().click()
  await page.getByRole('button', { name: /Receive stock/ }).click()
  await page.getByLabel('Document file').setInputFiles(file)
  await expect(page.getByRole('heading', { name: /Receive stock/ })).toBeVisible({ timeout: 30_000 })
}

test('a sample invoice is read by the labelled demo extractor and can be reviewed and posted', async ({ page }) => {
  const { sb, shopId } = await apiAs('owner')
  const sku = uniqueSku('UP')
  const product = await sb.from('products').insert({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `Upload plug ${sku}`, brand: 'NGK' }).select('id').single()
  expect(product.error).toBeNull()

  await signIn(page, 'owner')
  await startReceiptWithFile(page, { name: 'bayan-0412.png', mimeType: 'image/png', buffer: readFileSync(SAMPLE) })

  // R-EXT-4: labelled demo; R-DOC-1: the original is shown.
  await expect(page.getByText('Nothing was read from the image.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Original document' }).or(page.getByRole('button', { name: /Original document/ })).first()).toBeVisible()
  // Pre-filled from the extraction; received quantity left for the user (R-POST-3).
  await expect(page.getByLabel('Document number')).toHaveValue('BAS-0412')
  await expect(visible(page.getByLabel('Line 1 description'))).toHaveValue('NGK SPARK PLUG BKR6E-11')
  await expect(visible(page.getByLabel('Line 1 received quantity'))).toHaveValue('')
  // R-DOC-5: uncertain values are marked.
  await expect(page.getByText('Uncertain: btl').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(/Uncertain\. Extracted: 2026-03-10/)).toBeVisible()

  // Keep one line, confirm it, and post.
  for (let i = 0; i < 3; i++) await visible(page.getByRole('button', { name: 'Remove line 2', exact: true })).click()
  await expect(page.getByLabel('Line 2 description').filter({ visible: true })).toHaveCount(0)
  await visible(page.getByLabel('Line 1 received quantity')).fill('20')
  await pickProduct(page, 1, sku)
  await page.getByRole('button', { name: 'Review and post' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('+20 pc')).toBeVisible()
  await dialog.getByRole('button', { name: 'Post', exact: true }).click()
  // Earlier runs posted the same sample file, so the duplicate review may appear (R-POST-9).
  const dup = dialog.getByText('Possible duplicate. Not posted.')
  await Promise.race([dup.waitFor(), dialog.waitFor({ state: 'hidden' })])
  if (await dup.isVisible()) {
    await dialog.getByLabel(/Post anyway: reason/).fill('E2E run: same sample file')
    await dialog.getByRole('button', { name: 'Post anyway' }).click()
  }
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  const balance = await sb.from('product_stock').select('qty').eq('id', product.data!.id).single()
  expect(balance.data!.qty).toBe('20')
})

test('posting the same file again needs duplicate review (R-POST-9)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  // Arrange: make sure a posted document with the sample file exists.
  const { sb, shopId } = await apiAs('owner')
  const posted = await sb.from('documents').select('id').eq('shop_id', shopId).eq('status', 'posted').not('file_sha256', 'is', null).limit(50)
  const hashes = await sb.from('documents').select('file_sha256').in('id', (posted.data ?? []).map((d) => d.id))
  const known = '1b3abbe6d4dcc1e7634da36a648de80d6339e983a7a09f209a503a991f71ff94'
  expect((hashes.data ?? []).some((h) => h.file_sha256 === known), 'run the previous test first: it posts the sample file').toBe(true)

  await signIn(page, 'owner')
  await startReceiptWithFile(page, { name: 'again.png', mimeType: 'image/png', buffer: readFileSync(SAMPLE) })
  const sku = uniqueSku('DP')
  await sb.from('products').insert({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `Dup part ${sku}`, brand: 'NGK' })
  for (let i = 0; i < 3; i++) await visible(page.getByRole('button', { name: 'Remove line 2', exact: true })).click()
  await visible(page.getByLabel('Line 1 received quantity')).fill('1')
  await pickProduct(page, 1, sku)
  await page.getByRole('button', { name: 'Review and post' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(dialog.getByText('Possible duplicate. Not posted.')).toBeVisible()
  await expect(dialog.getByText(/has the same file/).first()).toBeVisible()
})

test('an unknown photo is not read, and the draft stays open for manual entry (R-DOC-9)', async ({ page }) => {
  await signIn(page, 'staff')
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d4944415478da6364f8ffbf1e0005fe02fea7d6a0f60000000049454e44ae426082', 'hex')
  await startReceiptWithFile(page, { name: `photo-${Date.now()}.png`, mimeType: 'image/png', buffer: png })
  await expect(page.getByText(/The demo reads only the bundled sample invoices/)).toBeVisible()
  await visible(page.getByLabel('Line 1 description')).fill('Typed by hand')
  await expect(page.getByText('Unsaved changes')).toBeVisible()
})

test('phones offer the rear camera', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone only.')
  await signIn(page, 'staff')
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'New document' }).first().click()
  await page.getByRole('button', { name: /Record a sale/ }).click()
  await expect(page.getByText('Take a photo')).toBeVisible()
  await expect(page.locator('input[type=file][capture=environment]')).toHaveCount(1)
})
