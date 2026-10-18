import Decimal from 'decimal.js'
import { expect, test } from '@playwright/test'
import { apiAs, credentials, signIn, uniqueSku } from './helpers'

// T3.1 recorded sales and T3.2 settings and members, through the UI.

test('recorded sales today rises by the posted sale amount', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  const { sb, shopId } = await apiAs('owner')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const before = (await sb.rpc('recorded_sales', { p_shop_id: shopId, p_day: day })).data as { total: string }

  const sku = uniqueSku('SL')
  const product = await sb.from('products').insert({ shop_id: shopId, sku, part_number: `PN ${sku}`, description: `Sale part ${sku}`, brand: 'Bosch' }).select('id').single()
  await sb.rpc('set_opening_quantity', { p_product_id: product.data!.id, p_qty: '5' as unknown as number })
  const doc = await sb.from('documents').insert({ shop_id: shopId, direction: 'sale' }).select('id, updated_at').single()
  await sb.rpc('save_draft', {
    p_document_id: doc.data!.id,
    p_expected_updated_at: doc.data!.updated_at,
    p_header: {},
    p_lines: [{ description: 'Sold', quantity: '2', unit_price: '12.50', product_id: product.data!.id }],
  })
  const posted = await sb.rpc('post_document', { p_document_id: doc.data!.id, p_idempotency_key: crypto.randomUUID() })
  expect(posted.error).toBeNull()

  const expected = new Decimal(before.total).plus('25.00').toFixed(2)
  const formatted = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PHP' }).format(expected as unknown as number)
  await signIn(page, 'owner')
  await expect(page.getByText('Recorded sales today')).toBeVisible()
  await expect(page.getByText(formatted, { exact: true })).toBeVisible()
  await expect(page.getByText(/Not cash received and not profit/)).toBeVisible()
})

test('owner edits settings; members are listed; re-inviting a member is refused', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Covered once.')
  const { sb, shopId } = await apiAs('owner')
  try {
    await signIn(page, 'owner')
    await page.goto('/settings')
    const name = page.getByLabel('Shop name')
    await expect(name).toHaveValue('E2E test shop')
    await name.fill('E2E test shop (renamed)')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Settings saved.')).toBeVisible()
    // The shell shows the new name once the server has it (the form reloads from the server).
    await expect(page.getByText('E2E test shop (renamed)').first()).toBeVisible()
    const saved = await sb.from('shops').select('name').eq('id', shopId).single()
    expect(saved.data!.name).toBe('E2E test shop (renamed)')

    await expect(page.getByText(credentials('staff').email)).toBeVisible()
    await page.getByRole('button', { name: 'Invite member' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(credentials('staff').email)
    await dialog.getByRole('button', { name: 'Send invite' }).click()
    await expect(dialog.getByText('This person is already a member of the shop.')).toBeVisible()
  } finally {
    // Other tests rely on the original name.
    await sb.from('shops').update({ name: 'E2E test shop' }).eq('id', shopId)
  }
})

test('staff sees settings read only', async ({ page }) => {
  await signIn(page, 'staff')
  await page.goto('/settings')
  await expect(page.getByText('Only an owner can change them.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Invite member' })).toHaveCount(0)
})
