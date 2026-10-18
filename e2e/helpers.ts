import { expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export type Role = 'owner' | 'staff'

export function credentials(role: Role) {
  const email = process.env[role === 'owner' ? 'E2E_OWNER_EMAIL' : 'E2E_STAFF_EMAIL']
  const password = process.env[role === 'owner' ? 'E2E_OWNER_PASSWORD' : 'E2E_STAFF_PASSWORD']
  if (!email || !password) throw new Error('E2E users are missing. Run: node scripts/seed-dev-users.mjs')
  return { email, password }
}

export async function signIn(page: Page, role: Role) {
  const { email, password } = credentials(role)
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'E2E test shop' })).toBeVisible()
}

/** The workspace renders lines twice (table on desktop, cards on phone); act on the visible copy. */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first()
}

export function uniqueSku(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`
}

/** A supabase-js client signed in as an E2E user, for arranging data from "another session". */
export async function apiAs(role: Role) {
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword(credentials(role))
  if (error) throw error
  const { data: m } = await sb.from('memberships').select('shop_id').eq('user_id', data.user.id).limit(1).single()
  return { sb, shopId: m!.shop_id as string }
}

export async function createProductUI(page: Page, sku: string, description: string) {
  await page.goto('/inventory')
  await page.getByRole('button', { name: 'New product' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('SKU').fill(sku)
  await dialog.getByLabel('Manufacturer part number').fill(`PN ${sku}`)
  await dialog.getByLabel('Brand').fill('Bosch')
  await dialog.getByLabel('Description').fill(description)
  await dialog.getByLabel('Opening quantity (optional)').fill('0')
  await dialog.getByRole('button', { name: 'Create product' }).click()
  await expect(dialog).toBeHidden()
}

export async function pickProduct(page: Page, line: number, sku: string) {
  // The line's product picker is the "Select product" button in that line's row or card.
  const triggers = page.getByRole('button', { name: /Select product/ }).filter({ visible: true })
  await triggers.nth(line - 1).click()
  await page.getByPlaceholder('Search SKU, part number, description, brand').fill(sku)
  await page.getByRole('option').filter({ hasText: sku }).first().click()
}

export async function postDraft(page: Page, expectedChange: RegExp) {
  await page.getByRole('button', { name: 'Review and post' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(expectedChange)).toBeVisible()
  await dialog.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(dialog).toBeHidden()
  // R-UI-1: "Posted" appears only after the server confirms and the page reloads the document.
  await expect(page.getByText('posted', { exact: true }).first()).toBeVisible()
}
