// Live shop seed (plan T5.1, R-DEMO-1): one shop row and its first owner, with no products.
// The owner signs in, imports the real catalog, and invites staff from Settings.
// Usage: node scripts/seed-live-shop.mjs --name "Shop name" --owner-email owner@example.com
// The owner password comes from LIVE_OWNER_PASSWORD, or a new one is generated and written to .env.local.
import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { dbConfig, loadEnvLocal } from './db-config.mjs'
import { seedLiveShop, upsertAuthUser } from './seed-lib.mjs'

loadEnvLocal()

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    'owner-email': { type: 'string' },
    currency: { type: 'string', default: 'PHP' },
    timezone: { type: 'string', default: 'Asia/Manila' },
  },
})
if (!values.name || !values['owner-email']) {
  console.error('Usage: node scripts/seed-live-shop.mjs --name "Shop name" --owner-email owner@example.com [--currency PHP] [--timezone Asia/Manila]')
  process.exit(1)
}

if (!process.env.LIVE_OWNER_PASSWORD) {
  process.env.LIVE_OWNER_PASSWORD = randomBytes(15).toString('base64url')
  appendFileSync('.env.local', `\n# Live shop owner (scripts/seed-live-shop.mjs). Give it to the owner once; they change it in Settings.\nLIVE_OWNER_PASSWORD=${process.env.LIVE_OWNER_PASSWORD}\n`)
}

const client = new pg.Client(dbConfig())
await client.connect()
try {
  const ownerId = await upsertAuthUser(client, values['owner-email'], process.env.LIVE_OWNER_PASSWORD)
  await seedLiveShop(client, { name: values.name, ownerId, currency: values.currency, timezone: values.timezone })
  console.log(`Seeded live shop "${values.name}" with owner ${values['owner-email']}. No products. The password is LIVE_OWNER_PASSWORD in .env.local.`)
} finally {
  await client.end()
}
