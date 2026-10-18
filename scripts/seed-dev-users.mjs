// Dev and E2E only: creates (or resets) an owner and a staff user on the hosted dev project, and a test shop.
// Public sign-up is off (R-ROLE-2), so test users are written directly. Passwords live only in .env.local.
// Usage: node scripts/seed-dev-users.mjs
import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import pg from 'pg'
import { dbConfig, loadEnvLocal } from './db-config.mjs'

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
  await client.query('begin')
  const ids = {}
  for (const u of users) {
    const email = process.env[u.emailVar]
    const password = process.env[u.passVar]
    const existing = await client.query('select id from auth.users where email = $1', [email])
    let id = existing.rows[0]?.id
    if (id) {
      await client.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), updated_at = now() where id = $1`, [id, password])
    } else {
      const res = await client.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change_token_new, email_change)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
           extensions.crypt($2, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
         returning id`,
        [email, password],
      )
      id = res.rows[0].id
      await client.query(
        `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, $2::text, jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true), 'email', now(), now(), now())`,
        [id, String(id), email],
      )
    }
    ids[u.role] = id
  }

  let shop = (await client.query('select id from public.shops where name = $1', [SHOP_NAME])).rows[0]?.id
  if (!shop) shop = (await client.query(`insert into public.shops (name, currency, timezone) values ($1, 'PHP', 'Asia/Manila') returning id`, [SHOP_NAME])).rows[0].id
  for (const u of users) {
    await client.query(
      `insert into public.memberships (shop_id, user_id, role) values ($1, $2, $3) on conflict (shop_id, user_id) do update set role = excluded.role`,
      [shop, ids[u.role], u.role],
    )
  }
  await client.query('commit')
  console.log(`Seeded ${SHOP_NAME} with ${users.map((u) => `${process.env[u.emailVar]} (${u.role})`).join(', ')}. Passwords are in .env.local.`)
} catch (err) {
  await client.query('rollback')
  throw err
} finally {
  await client.end()
}
