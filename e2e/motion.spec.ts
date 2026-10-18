/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers'

// Motion pass (doc/plan/1792325769_motion_pass.md). Each probe reads the running CSS transitions,
// so it fails if @starting-style does not apply, not only if a class name is missing.

/** Record the transitions that run on each `selector` element added after this call. */
async function watchEntrances(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const w = window as unknown as { __entrances: string[][] }
    w.__entrances = []
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement) {
            const found = n.matches(sel) ? [n] : [...n.querySelectorAll<HTMLElement>(sel)]
            for (const el of found)
              requestAnimationFrame(() =>
                w.__entrances.push(el.getAnimations().map((a) => (a as CSSTransition).transitionProperty ?? 'animation')),
              )
          }
    }).observe(document.body, { childList: true, subtree: true })
  }, selector)
}

const entrances = (page: Page) => page.evaluate(() => (window as unknown as { __entrances: string[][] }).__entrances)

test('page transitions: a new path enters with a fade, a filter change does not replay it', async ({ page }) => {
  await signIn(page, 'owner')
  await page.goto('/inbox')
  const first = await page.locator('.motion-page').elementHandle()
  await watchEntrances(page, '.motion-page')

  // A filter lives in the search parameters: same page element, no entrance.
  await page.getByRole('tab').nth(1).click()
  await expect(page).toHaveURL(/show=/)
  expect(await first!.evaluate((el) => el.isConnected)).toBe(true)
  expect(await entrances(page)).toEqual([])

  // A new path mounts a new page element, and its entrance runs.
  await page.getByRole('link', { name: 'Inventory' }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/inventory/)
  await expect.poll(() => entrances(page)).toEqual([expect.arrayContaining(['opacity', 'transform'])])
  expect(await first!.evaluate((el) => el.isConnected)).toBe(false)
})

test('inline alerts enter with the shared class, and reduced motion makes them instant', async ({ page, browser }) => {
  const failSignIn = (p: Page) =>
    p.route('**/auth/v1/token?*', (route) =>
      route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }),
    )
  const submit = async (p: Page) => {
    await p.goto('/sign-in')
    await p.getByLabel('Email').fill('nobody@example.com')
    await p.getByLabel('Password').fill('wrong-password')
    await watchEntrances(p, '.motion-enter')
    await p.getByRole('button', { name: 'Sign in' }).click()
    await expect(p.getByRole('alert')).toBeVisible()
    return p.getByRole('alert')
  }

  await failSignIn(page)
  const alert = await submit(page)
  await expect(alert).toHaveClass(/motion-enter/)
  expect(await alert.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.2s, 0.2s')
  await expect.poll(() => entrances(page)).toEqual([expect.arrayContaining(['opacity', 'transform'])])

  const reduced = await browser.newContext({ reducedMotion: 'reduce' })
  const calm = await reduced.newPage()
  await failSignIn(calm)
  const calmAlert = await submit(calm)
  expect(await calmAlert.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.001)
  await reduced.close()
})
