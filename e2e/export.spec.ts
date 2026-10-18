import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { apiAs, signIn, uniqueSku } from './helpers'

// T3.4, R-ACT-1: CSV export of products, movements, and documents with exact decimals.
test('exports carry exact quantities and money', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  const { sb, shopId } = await apiAs('owner')
  const sku = uniqueSku('EX')
  const product = await sb
    .from('products')
    .insert({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `=Export part ${sku}`, brand: 'NGK', selling_price: '0.10' as unknown as number })
    .select('id')
    .single()
  await sb.rpc('set_opening_quantity', { p_product_id: product.data!.id, p_qty: '2.125' as unknown as number })

  await signIn(page, 'staff')
  await page.goto('/settings')
  const read = async (label: string) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()])
    return readFile((await download.path())!, 'utf8')
  }

  const products = await read('Products and stock on hand')
  const line = products.split('\r\n').find((l) => l.startsWith(sku))
  expect(line).toBe(`${sku},PN ${sku},'=Export part ${sku},NGK,pc,0.10,0,,2.125`)

  const movements = await read('Stock movements (ledger)')
  expect(movements.split('\r\n').some((l) => l.includes(`,${sku},`) && l.includes(',2.125,pc,opening,'))).toBe(true)

  const documents = await read('Documents')
  expect(documents.startsWith('\uFEFFdocument_id,type,status')).toBe(true)
})
