import { expect, test } from '@playwright/test'

// T5.1: the seeded demo shop, as a demo staff user sees it first. R-DEMO-1, R-PROD-5.
// Needs scripts/seed-demo.mjs to have run against the dev project. Read only: it changes no data.

test('demo staff sees the labelled demo shop with the synthetic catalog', async ({ page }) => {
  const email = process.env.DEMO_STAFF_EMAIL
  const password = process.env.DEMO_STAFF_PASSWORD
  test.skip(!email || !password, 'Demo users are missing. Run: node scripts/seed-demo.mjs')

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Demo shop (synthetic data)' })).toBeVisible()
  await expect(page.getByText('Synthetic sample data. It is kept apart from live shop data.')).toBeVisible()

  await page.goto('/inventory')
  await page.getByLabel('Search products').fill('BP-1503')
  // Same part number, different brands: two products, never merged.
  const main = page.getByRole('main')
  await expect(main.getByText('Akebono').filter({ visible: true }).first()).toBeVisible()
  await expect(main.getByText('Bendix').filter({ visible: true }).first()).toBeVisible()
  await expect(main.getByText('DM-0015').filter({ visible: true }).first()).toBeVisible()
  await expect(main.getByText('DM-0016').filter({ visible: true }).first()).toBeVisible()
})
