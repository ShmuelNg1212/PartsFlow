import { expect, test } from '@playwright/test'
import { credentials, signIn } from './helpers'

test('R-ROLE-1: signing in as staff after owner clears owner membership and cached controls', async ({ page }) => {
  await signIn(page, 'owner')
  await page.getByRole('navigation', { name: 'Main' }).filter({ visible: true }).getByRole('link', { name: 'Inventory', exact: true }).click()
  await expect(page.getByRole('button', { name: 'New product' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).filter({ visible: true }).click()
  // Stay in the same SPA instance so the previous account's cache is still fresh.
  const { email, password } = credentials('staff')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('navigation', { name: 'Main' }).filter({ visible: true }).getByRole('link', { name: 'Inventory', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New product' })).toHaveCount(0)
})

test('R-DEMO-1: a document from another shop is not shown under the selected shop', async ({ page }) => {
  const { apiAs } = await import('./helpers')
  const { sb, shopId } = await apiAs('owner')
  const created = await sb.from('documents').insert({ shop_id: shopId, direction: 'receipt', doc_number: 'SHOP-SCOPE' }).select('id').single()
  expect(created.error).toBeNull()
  // Stub only the membership list: the detail request still reaches the real API.
  const otherShop = '00000000-0000-4000-8000-000000000099'
  await page.route('**/rest/v1/memberships?*', async route => {
    if (route.request().method() !== 'GET') { await route.continue(); return }
    const response = await route.fetch({ timeout: 10_000 })
    const rows = await response.json()
    await route.fulfill({ response, json: [...rows, { role: 'owner', shop: { id: otherShop, name: 'Second test shop', currency: 'USD', timezone: 'UTC', is_demo: true } }] })
  })
  await signIn(page, 'owner')
  await page.goto(`/inbox/${created.data!.id}`)
  await expect(page.getByRole('heading', { name: /Receive stock/ })).toBeVisible()
  await page.getByLabel('Line 1 description').filter({ visible: true }).fill('Keep this last edit')
  await page.getByRole('combobox', { name: /^Shop/ }).filter({ visible: true }).selectOption(otherShop)
  await expect(page).toHaveURL('http://localhost:5173/')
  await page.goto(`/inbox/${created.data!.id}`)
  await expect(page.getByText('Document not found', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review and post' })).toHaveCount(0)
  await page.getByRole('combobox', { name: /^Shop/ }).filter({ visible: true }).selectOption(shopId)
  await page.goto(`/inbox/${created.data!.id}`)
  await page.getByRole('button', { name: 'Restore them', exact: true }).click()
  await expect(page.getByLabel('Line 1 description').filter({ visible: true })).toHaveValue('Keep this last edit')
})
