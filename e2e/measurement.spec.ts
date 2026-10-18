import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { apiAs, signIn, uniqueSku } from './helpers'

// T6.1: opening a draft in the app starts the pilot timer; the owner exports one measured row per posted document.
test('owner exports pilot measurements with the time from first open to post', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  const { sb, shopId } = await apiAs('owner')
  const sku = uniqueSku('MS')
  const product = await sb.from('products').insert({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `Measured part ${sku}`, brand: 'Bosch' }).select('id').single()
  const doc = await sb.from('documents').insert({ shop_id: shopId, direction: 'receipt', doc_number: sku }).select('id, updated_at').single()
  await sb.rpc('save_draft', {
    p_document_id: doc.data!.id,
    p_expected_updated_at: doc.data!.updated_at,
    p_header: {},
    p_lines: [{ description: 'Measured', quantity: '3', received_quantity: '3', unit_price: '10.00', product_id: product.data!.id }],
  })

  await signIn(page, 'staff')
  await page.goto(`/inbox/${doc.data!.id}`)
  await expect(page.getByLabel('Line 1 description').filter({ visible: true })).toHaveValue('Measured')
  await expect
    .poll(async () => (await sb.from('audit_events').select('id').eq('entity_id', doc.data!.id).eq('kind', 'document.opened')).data?.length)
    .toBe(1)

  // Staff cannot export the measurements.
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Products and stock on hand' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pilot measurements' })).toHaveCount(0)

  const posted = await sb.rpc('post_document', { p_document_id: doc.data!.id, p_idempotency_key: crypto.randomUUID() })
  expect(posted.error).toBeNull()

  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())
  await signIn(page, 'owner')
  await page.goto('/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Pilot measurements' }).click()])
  const csv = await readFile((await download.path())!, 'utf8')
  const [header, ...rows] = csv.replace('﻿', '').trim().split('\r\n')
  expect(header).toBe(
    'document_id,direction,doc_number,status,posted_at_utc,demo_shop,extraction_provider,extraction_status,open_to_post_seconds,lines,extracted_lines,lines_from_extraction,compared_fields,corrected_fields,suggested_lines,match_changes',
  )
  const cells = rows.find((r) => r.startsWith(doc.data!.id))?.split(',')
  expect(cells).toBeDefined()
  expect(cells!.slice(1, 4)).toEqual(['receipt', sku, 'posted'])
  expect(cells![5]).toBe('false')
  expect(cells![8]).toMatch(/^\d+$/)
  expect(cells!.slice(9)).toEqual(['1', '0', '0', '0', '0', '0', '0'])
})
