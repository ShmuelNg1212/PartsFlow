// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

function check(overrides: Record<string, string> = {}) {
  const env = { ...process.env }
  delete env.VITE_SUPABASE_URL
  delete env.VITE_SUPABASE_PUBLISHABLE_KEY
  return spawnSync(process.execPath, ['scripts/check-production-env.mjs'], { env: { ...env, ...overrides }, encoding: 'utf8' })
}

it('requires explicit production values instead of falling back to development .env.local', () => {
  const result = check()
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('VITE_SUPABASE_URL')
  expect(result.stderr).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
})

it('R-DATA-6: rejects a server secret without printing it', () => {
  const secret = 'sb_secret_test_private_value'
  const result = check({ VITE_SUPABASE_URL: 'https://production.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: secret })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('publishable key')
  expect(result.stderr + result.stdout).not.toContain(secret)
})

it('rejects a non-HTTPS production backend', () => {
  const result = check({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('HTTPS')
})

it('accepts an explicit HTTPS origin and publishable key', () => {
  const result = check({ VITE_SUPABASE_URL: 'https://production.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })
  expect(result.status).toBe(0)
})
