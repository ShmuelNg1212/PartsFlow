// Runs one read query against the hosted database and prints rows as JSON. Dev aid only.
import pg from 'pg'
import { dbConfig, loadEnvLocal } from './db-config.mjs'

loadEnvLocal()
const client = new pg.Client(dbConfig())
await client.connect()
try {
  const res = await client.query(process.argv[2])
  console.log(JSON.stringify(res.rows, null, 1))
} finally {
  await client.end()
}
