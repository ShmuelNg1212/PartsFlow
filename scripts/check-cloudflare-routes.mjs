// Run against the local Wrangler server. Navigation must fall back; asset misses must not.
import assert from 'node:assert/strict'
const origin = process.argv[2] ?? 'http://localhost:8787'
for (const path of ['/inventory', '/inbox/00000000-0000-4000-8000-000000000001', '/set-password']) {
  const response = await fetch(new URL(path, origin), { headers: { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' } })
  assert.equal(response.redirected, false, `${path} must retain its URL`)
  assert.equal(response.status, 200, `${path} must serve the application`)
  assert.match(await response.text(), /<title>PartsFlow<\/title>/)
}
const missing = await fetch(new URL('/assets/missing-release-file.js', origin))
assert.equal(missing.status, 404, 'A missing script must return 404')
console.log('Cloudflare navigation and missing-asset checks passed.')
