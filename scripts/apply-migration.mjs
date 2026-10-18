// Applies migration files to the hosted database in one transaction each, and records them in
// supabase_migrations.schema_migrations (the same table the Supabase MCP and CLI read).
// Usage: node scripts/apply-migration.mjs supabase/migrations/<file>.sql [...]
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import pg from 'pg'
import { dbConfig, loadEnvLocal } from './db-config.mjs'

loadEnvLocal()
const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Give one or more migration files.')
  process.exit(1)
}

const client = new pg.Client(dbConfig())
await client.connect()
try {
  for (const file of files) {
    const m = basename(file).match(/^(\d{14})_(.+)\.sql$/)
    if (!m) throw new Error(`${file}: name must be <14-digit version>_<name>.sql`)
    const [, version, name] = m
    const done = await client.query('select 1 from supabase_migrations.schema_migrations where version = $1 or name = $2', [version, name])
    if (done.rowCount) {
      console.log(`skip ${basename(file)} (already recorded)`)
      continue
    }
    const sql = readFileSync(file, 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [version, name, [sql]])
      await client.query('commit')
      console.log(`applied ${basename(file)}`)
    } catch (err) {
      await client.query('rollback')
      throw new Error(`${basename(file)} failed: ${err.message}`)
    }
  }
} finally {
  await client.end()
}
