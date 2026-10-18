// Dev and E2E only: creates (or resets) an owner and a staff user on the hosted dev project, and a test shop.
// Public sign-up is off (R-ROLE-2), so test users are written directly. Passwords live only in .env.local.
// Usage: node scripts/seed-dev-users.mjs
import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import pg from 'pg'
import { dbConfig, loadEnvLocal } from './db-config.mjs'
import { upsertAuthUser, upsertMembership, upsertShop } from './seed-lib.mjs'

loadEnvLocal()

const SHOP_NAME = 'E2E test shop'
const users = [
  { role: 'owner', emailVar: 'E2E_OWNER_EMAIL', passVar: 'E2E_OWNER_PASSWORD', email: 'e2e-owner@partsflow.test' },
  { role: 'staff', emailVar: 'E2E_STAFF_EMAIL', passVar: 'E2E_STAFF_PASSWORD', email: 'e2e-staff@partsflow.test' },
]

const added = []
for (const u of users) {
  if (!process.env[u.passVar]) {
    process.env[u.passVar] = randomBytes(15).toString('base64url')
    added.push(`${u.passVar}=${process.env[u.passVar]}`)
  }
  if (!process.env[u.emailVar]) {
    process.env[u.emailVar] = u.email
    added.push(`${u.emailVar}=${u.email}`)
  }
}
if (added.length) appendFileSync('.env.local', `\n# E2E test users (scripts/seed-dev-users.mjs)\n${added.join('\n')}\n`)

const client = new pg.Client(dbConfig())
await client.connect()
try {
  const ids = {}
  for (const u of users) ids[u.role] = await upsertAuthUser(client, process.env[u.emailVar], process.env[u.passVar])
  await client.query('begin')
  try {
    const shop = await upsertShop(client, { name: SHOP_NAME, isDemo: false })
    for (const u of users) await upsertMembership(client, shop, ids[u.role], u.role)
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  }
  console.log(`Seeded ${SHOP_NAME} with ${users.map((u) => `${process.env[u.emailVar]} (${u.role})`).join(', ')}. Passwords are in .env.local.`)
} finally {
  await client.end()
}
