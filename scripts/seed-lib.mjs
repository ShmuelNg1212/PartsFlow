// Seed steps shared by scripts/seed-demo.mjs, scripts/seed-live-shop.mjs, and scripts/seed-dev-users.mjs (plan T5.1).
// Each step takes a superuser pg client and is safe to run again.
import { DEMO_SHOP, PRODUCTS, SUPPLIERS } from './demo-data.mjs'

/** Creates the email user, or resets its password. Public sign-up is off (R-ROLE-2), so users are written directly. */
export async function upsertAuthUser(client, email, password) {
  const existing = await client.query('select id from auth.users where email = $1', [email])
  const id = existing.rows[0]?.id
  if (id) {
    await client.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), updated_at = now() where id = $1`, [id, password])
    return id
  }
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
  const newId = res.rows[0].id
  await client.query(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::uuid, $2::text, jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true), 'email', now(), now(), now())`,
    [newId, String(newId), email],
  )
  return newId
}

/** Finds the shop by name and demo flag, or creates it. Returns its id. */
export async function upsertShop(client, { name, isDemo, currency = 'PHP', timezone = 'Asia/Manila' }) {
  const found = await client.query('select id from public.shops where name = $1 and is_demo = $2 order by created_at limit 1', [name, isDemo])
  if (found.rows[0]) return found.rows[0].id
  const res = await client.query(
    'insert into public.shops (name, currency, timezone, is_demo) values ($1, $2, $3, $4) returning id',
    [name, currency, timezone, isDemo],
  )
  return res.rows[0].id
}

export async function upsertMembership(client, shopId, userId, role) {
  await client.query(
    `insert into public.memberships (shop_id, user_id, role) values ($1, $2, $3)
     on conflict (shop_id, user_id) do update set role = excluded.role`,
    [shopId, userId, role],
  )
}

/**
 * Demo shop with the synthetic catalog, opening quantities, and suppliers (R-DEMO-1).
 * Products go through import_products as the demo owner, so the same validation, opening movements,
 * and audit event apply as for a real import. A shop that already has products is not imported again.
 */
export async function seedDemoShop(client, { ownerId, staffId }) {
  await client.query('begin')
  try {
    const shopId = await upsertShop(client, { ...DEMO_SHOP, isDemo: true })
    await upsertMembership(client, shopId, ownerId, 'owner')
    await upsertMembership(client, shopId, staffId, 'staff')

    let productsInserted = 0
    const { rows } = await client.query('select count(*)::int as n from public.products where shop_id = $1', [shopId])
    if (rows[0].n === 0) {
      const importRows = PRODUCTS.map(([sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin, opening_qty]) => ({
        sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin, opening_qty,
      }))
      // Act as the owner for this transaction only; both settings end with it.
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ownerId, role: 'authenticated' })])
      await client.query('set local role authenticated')
      const res = await client.query('select public.import_products($1, $2::jsonb) as result', [shopId, JSON.stringify(importRows)])
      await client.query('reset role')
      await client.query(`select set_config('request.jwt.claims', '', true)`)
      productsInserted = res.rows[0].result.inserted
    }

    for (const name of SUPPLIERS) {
      await client.query(
        `insert into public.counterparties (shop_id, kind, name, created_by) values ($1, 'supplier', $2, $3) on conflict do nothing`,
        [shopId, name, ownerId],
      )
    }
    await client.query('commit')
    return { shopId, productsInserted }
  } catch (err) {
    await client.query('rollback')
    throw err
  }
}

/** Live shop: one shop row and its first owner. No products; the owner imports the real catalog (R-DEMO-1). */
export async function seedLiveShop(client, { name, ownerId, currency, timezone }) {
  await client.query('begin')
  try {
    const shopId = await upsertShop(client, { name, isDemo: false, currency, timezone })
    await upsertMembership(client, shopId, ownerId, 'owner')
    await client.query('commit')
    return shopId
  } catch (err) {
    await client.query('rollback')
    throw err
  }
}
