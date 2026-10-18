import { expect, test } from '@playwright/test'
import { signIn, uniqueSku } from './helpers'

// T3.3, R-PROD-2: preview with per-row errors; nothing is written until confirm; all rows or none.
test('owner previews a CSV, fixes it, and imports', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  const a = uniqueSku('IM')
  const b = uniqueSku('IM')
  await signIn(page, 'owner')
  await page.goto('/inventory/import')

  const bad = `SKU,Part No,Description,Brand,Price,Qty\n${a},PN-${a},Import part A,Bosch,99.50,7\n${b},PN-${b},Import part B,,10,1\n`
  await page.getByLabel('CSV file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) })
  await expect(page.getByText('Brand is required. Different brands are different products.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import 2 products' })).toBeDisabled()

  const good = `SKU,Part No,Description,Brand,Price,Qty\n${a},PN-${a},Import part A,Bosch,99.50,7\n${b},PN-${b},Import part B,Denso,10,1\n`
  await page.getByLabel('CSV file').setInputFiles({ name: 'good.csv', mimeType: 'text/csv', buffer: Buffer.from(good) })
  await page.getByRole('button', { name: 'Import 2 products' }).click()
  await expect(page.getByText('Imported 2 products.')).toBeVisible()

  await page.goto(`/inventory?q=${a}`)
  await page.getByRole('link', { name: 'Import part A' }).filter({ visible: true }).first().click()
  await expect(page.locator('dd').filter({ hasText: /^7\s*pc/ }).first()).toBeVisible()
  await expect(page.getByText('Opening quantity').filter({ visible: true }).first()).toBeVisible()
})

test('staff cannot open the import page', async ({ page }) => {
  await signIn(page, 'staff')
  await page.goto('/inventory/import')
  await expect(page).toHaveURL(/\/inventory$/)
  await expect(page.getByRole('link', { name: 'Import CSV' })).toHaveCount(0)
})
