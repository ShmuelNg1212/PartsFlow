/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers'

// Phase 7: adversarial values enter at the API boundary. No live products are changed.
const product = {
  id: '00000000-0000-4000-8000-000000000007',
  sku: 'BOSCH-DIESEL-INJECTOR-COMMONRAIL-0445110186',
  part_number: '0445110186/0986435089/33800-27000',
  description: 'Common rail diesel injector assembly with copper sealing washer for Hyundai Santa Fe and Kia Sportage 2.0 CRDi',
  brand: 'Bosch', base_unit: 'pc', selling_price: '12345678.90',
  reorder_threshold: '1', shelf_bin: null, qty: '123456789.123', is_low: false, has_movements: true,
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1)
}

test('R-UI-1: long identifiers, large quantities, empty inventory, and keyboard focus remain usable', async ({ page }, testInfo) => {
  let rows = [product]
  await page.route('**/rest/v1/rpc/search_products', route => route.fulfill({ json: rows }))
  await page.route('**/rest/v1/product_stock?*', route => route.fulfill({ json: [product] }))
  await signIn(page, 'owner')
  for (const width of [320, 768, 1366, 2560]) {
    await page.setViewportSize({ width, height: 860 })
    await page.goto('/inventory')
    await expect(page.getByText(product.description).filter({ visible: true }).first()).toBeVisible()
    await noPageOverflow(page)
    const quantity = page.getByText('123456789.123', { exact: false }).filter({ visible: true }).first()
    await expect(quantity).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`inventory-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 320, height: 640 })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await noPageOverflow(page)
  const largeQuantity = page.getByText('123456789.123', { exact: false }).filter({ visible: true }).first()
  expect(await largeQuantity.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  const newProduct = await page.getByRole('button', { name: 'New product' }).boundingBox()
  expect(newProduct!.x + newProduct!.width).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('inventory-large-text.png'), fullPage: true })
  await page.reload()
  await page.getByRole('button', { name: 'New product' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Create product', exact: true }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Create product', exact: true })).toBeInViewport()
  await noPageOverflow(page)
  await page.keyboard.press('Escape')
  rows = []
  await page.reload()
  await expect(page.getByText('No products yet', { exact: true })).toBeVisible()
  await noPageOverflow(page)
  await page.getByRole('searchbox', { name: 'Search products' }).focus()
  const outline = await page.evaluate<string>('getComputedStyle(document.activeElement).outlineWidth')
  expect(parseFloat(outline)).toBeGreaterThanOrEqual(2)
})
