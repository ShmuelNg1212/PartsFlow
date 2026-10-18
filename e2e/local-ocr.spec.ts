import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { apiAs, pickProduct, signIn, uniqueSku, visible } from './helpers'

// Plan P4: actual local PaddleOCR through the authenticated bridge. R-DOC-1, R-DOC-5, R-EXT-3, R-POST-1, R-POST-3, R-POST-9.
// Runs only when LOCAL_OCR_E2E=1, with the worker, the bridge, and `VITE_LOCAL_OCR=true npm run dev` running.
// LOCAL_OCR_E2E=stopped runs the stopped-worker check instead; stop the worker first.
// The documents come from scripts/make-extraction-cases.mjs (synthetic).

const mode = process.env.LOCAL_OCR_E2E
const cases = process.env.LOCAL_OCR_CASES ?? '/private/tmp/partsflow-extraction-cases'
const file = (name: string, mimeType: string) => ({ name, mimeType, buffer: readFileSync(join(cases, name)) })
const READ = 60_000

async function startReceipt(page: Page, upload: { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto('/inbox')
  await page.getByRole('button', { name: 'New document' }).first().click()
  await page.getByRole('button', { name: /Receive stock/ }).click()
  await page.getByLabel('Document file').setInputFiles(upload)
  await expect(page.getByRole('heading', { name: /Receive stock/ })).toBeVisible({ timeout: READ })
}

test.describe('local PaddleOCR', () => {
  test.skip(mode !== '1', 'Set LOCAL_OCR_E2E=1 with the local worker and bridge running.')
  test.setTimeout(180_000)

  test('a synthetic PDF is read by PaddleOCR, corrected, saved, and posted once', async ({ page }) => {
    const { sb, shopId } = await apiAs('owner')
    const skus = [uniqueSku('OCR'), uniqueSku('OCR')]
    const products = await sb.from('products')
      .insert(skus.map((sku, i) => ({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `OCR ${i ? 'air' : 'oil'} filter ${sku}`, brand: 'Fictional' })))
      .select('id, sku')
    expect(products.error).toBeNull()
    const ids = skus.map((sku) => products.data!.find((p) => p.sku === sku)!.id)
    const stock = async () => {
      const { data } = await sb.from('product_stock').select('id, qty').in('id', ids)
      return ids.map((id) => data!.find((r) => r.id === id)?.qty ?? null)
    }

    await signIn(page, 'owner')
    await startReceipt(page, file('readable-invoice.pdf', 'application/pdf'))

    // Actual OCR, labelled with its provider. Values are a draft only (R-EXT-3).
    await expect(page.getByText('Read automatically (paddleocr-local).')).toBeVisible({ timeout: READ })
    await expect(page.getByLabel('Document number')).toHaveValue('SYN-EVAL-101')
    await expect(visible(page.getByLabel('Line 1 description'))).toHaveValue('Oil filter, model A')
    await expect(visible(page.getByLabel('Line 1 part number'))).toHaveValue('LAB-OF-001')
    await expect(visible(page.getByLabel('Line 1 invoice quantity'))).toHaveValue('3')
    await expect(visible(page.getByLabel('Line 1 price', { exact: true }))).toHaveValue(/^125\.50?$/)
    await expect(visible(page.getByLabel('Line 2 description'))).toHaveValue('Air filter, model B')
    await expect(visible(page.getByLabel('Line 2 part number'))).toHaveValue('LAB-AF-002')
    // R-POST-3: received quantity is never pre-filled.
    await expect(visible(page.getByLabel('Line 1 received quantity'))).toHaveValue('')
    // The supplier had no label, so it is marked as not found (R-DOC-5).
    expect(await stock()).toEqual(['0', '0'])

    // The owner corrects and confirms.
    await visible(page.getByLabel('Line 1 received quantity')).fill('3')
    await visible(page.getByLabel('Line 2 received quantity')).fill('2')
    // pickProduct counts unpicked lines, so pick the later line first.
    await pickProduct(page, 2, skus[1]!)
    await pickProduct(page, 1, skus[0]!)
    await page.getByRole('button', { name: /Save draft/ }).click()
    await expect(page.getByText('All changes saved')).toBeVisible()
    await page.reload()
    await expect(visible(page.getByLabel('Line 2 received quantity'))).toHaveValue('2')
    await expect(page.getByText('Read automatically (paddleocr-local).')).toBeVisible()
    expect(await stock(), 'a saved draft does not change stock').toEqual(['0', '0'])

    await page.getByRole('button', { name: 'Review and post' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('+3 pc')).toBeVisible()
    await expect(dialog.getByText('+2 pc')).toBeVisible()
    await dialog.getByRole('button', { name: 'Post', exact: true }).click()
    // Earlier runs and the other viewport post the same file, so duplicate review may appear (R-POST-9).
    const dup = dialog.getByText('Possible duplicate. Not posted.')
    await Promise.race([dup.waitFor(), dialog.waitFor({ state: 'hidden' })])
    if (await dup.isVisible()) {
      await dialog.getByLabel(/Post anyway: reason/).fill('E2E run: same synthetic file')
      await dialog.getByRole('button', { name: 'Post anyway' }).click()
    }
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText('posted', { exact: true }).first()).toBeVisible()
    expect(await stock()).toEqual(['3', '2'])

    // A retry does not post again (R-POST-1).
    const docId = page.url().split('/').pop()!
    const retry = await sb.rpc('post_document', { p_document_id: docId, p_idempotency_key: crypto.randomUUID() })
    expect(retry.error?.message ?? (retry.data as { already_posted: boolean }).already_posted).toBeTruthy()
    const moves = await sb.from('stock_movements').select('id').eq('document_id', docId)
    expect(moves.data).toHaveLength(2)
    expect(await stock()).toEqual(['3', '2'])

    // Inventory and stock history show the receipt.
    await page.goto(`/inventory?q=${encodeURIComponent(skus[0]!)}`)
    await visible(page.getByRole('link', { name: new RegExp(skus[0]!) })).click()
    await expect(page.locator('dd').filter({ hasText: /^3\s*pc/ }).first()).toBeVisible()
    await expect(visible(page.getByRole('link', { name: /^Receipt/ }))).toBeVisible()
    await page.goto('/history')
    await expect(page.getByText('SYN-EVAL-101').filter({ visible: true }).first()).toBeVisible()
  })

  test('a phone photo is read through the same path', async ({ page }) => {
    await signIn(page, 'owner')
    await startReceipt(page, file('phone-photo.jpg', 'image/jpeg'))
    await expect(page.getByText('Read automatically (paddleocr-local).')).toBeVisible({ timeout: READ })
    await expect(visible(page.getByLabel('Line 1 description'))).toHaveValue('Brake pad set')
    await expect(visible(page.getByLabel('Line 1 part number'))).toHaveValue('LAB-BP-030')
    await expect(visible(page.getByLabel('Line 1 invoice quantity'))).toHaveValue('2')
  })

  test('a poor photo gives no lines and leaves manual entry open', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Covered once.')
    await signIn(page, 'owner')
    await startReceipt(page, file('poor-rotated-photo.jpg', 'image/jpeg'))
    await expect(page.getByText('Read automatically (paddleocr-local).')).toBeVisible({ timeout: READ })
    await expect(page.getByLabel('Document number')).toHaveValue('SYN-EVAL-105')
    await visible(page.getByLabel('Line 1 description')).fill('Typed by hand')
    await expect(page.getByText('Unsaved changes')).toBeVisible()
  })

  test('every page of a three-page PDF is read', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Covered once.')
    await signIn(page, 'owner')
    await startReceipt(page, file('three-page-invoice.pdf', 'application/pdf'))
    await expect(page.getByText('Read automatically (paddleocr-local).')).toBeVisible({ timeout: READ })
    await expect(visible(page.getByLabel('Line 1 description'))).toHaveValue('Test axle bushing')
    await expect(page.getByLabel('Line 2 description').filter({ visible: true })).toHaveCount(0)
  })
})

test.describe('local PaddleOCR with the worker stopped', () => {
  test.skip(mode !== 'stopped', 'Set LOCAL_OCR_E2E=stopped after stopping the worker.')

  test('the draft says the scanner is not running and stays open for manual entry', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Covered once.')
    await signIn(page, 'owner')
    await startReceipt(page, file('readable-invoice.pdf', 'application/pdf'))
    await expect(page.getByText(/The local scanner is not running/)).toBeVisible({ timeout: READ })
    await visible(page.getByLabel('Line 1 description')).fill('Typed by hand')
    await expect(page.getByText('Unsaved changes')).toBeVisible()
  })
})
