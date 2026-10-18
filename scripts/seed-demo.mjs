// Demo shop seed (plan T5.1, R-DEMO-1): a demo shop with the synthetic catalog, two synthetic suppliers,
// and a demo owner and staff user. Safe to run again: users get their passwords reset; data is not duplicated.
// Passwords live only in .env.local. Usage: node scripts/seed-demo.mjs
import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import pg from 'pg'
import { DEMO_SHOP } from './demo-data.mjs'
import { dbConfig, loadEnvLocal } from './db-config.mjs'
import { seedDemoShop, upsertAuthUser } from './seed-lib.mjs'

loadEnvLocal()

const users = [
  { role: 'owner', emailVar: 'DEMO_OWNER_EMAIL', passVar: 'DEMO_OWNER_PASSWORD', email: 'demo-owner@partsflow.test' },
  { role: 'staff', emailVar: 'DEMO_STAFF_EMAIL', passVar: 'DEMO_STAFF_PASSWORD', email: 'demo-staff@partsflow.test' },
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
if (added.length) appendFileSync('.env.local', `\n# Demo shop users (scripts/seed-demo.mjs)\n${added.join('\n')}\n`)

const client = new pg.Client(dbConfig())
await client.connect()
try {
  const ids = {}
  for (const u of users) ids[u.role] = await upsertAuthUser(client, process.env[u.emailVar], process.env[u.passVar])
  const { productsInserted } = await seedDemoShop(client, { ownerId: ids.owner, staffId: ids.staff })
  console.log(
    `Seeded "${DEMO_SHOP.name}": ${productsInserted ? `${productsInserted} products imported` : 'catalog already present'}; ` +
      `users ${users.map((u) => `${process.env[u.emailVar]} (${u.role})`).join(', ')}. Passwords are in .env.local.`,
  )
} finally {
  await client.end()
}
