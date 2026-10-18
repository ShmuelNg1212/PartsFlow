import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import type { TestProject } from 'vitest/node'

// Creates a fresh scratch database, then applies the Supabase shim and every migration in order.
// Tests run against it as the API roles, so grants and RLS apply as they do in Supabase.

const ROOT = join(import.meta.dirname, '..', '..')
const SERVER_URL = process.env.TEST_PG_URL ?? 'postgres://localhost:5432/postgres'
const DB_NAME = 'partsflow_test'

function withDatabase(url: string, db: string): string {
  const u = new URL(url)
  u.pathname = `/${db}`
  return u.toString()
}

export default async function setup(project: TestProject) {
  const server = new pg.Client({ connectionString: SERVER_URL })
  await server.connect()
  await server.query(`drop database if exists ${DB_NAME} with (force)`)
  await server.query(`create database ${DB_NAME}`)
  await server.end()

  const dbUrl = withDatabase(SERVER_URL, DB_NAME)
  const db = new pg.Client({ connectionString: dbUrl })
  await db.connect()
  try {
    await db.query(readFileSync(join(ROOT, 'test/db/shim.sql'), 'utf8'))
    const dir = join(ROOT, 'supabase/migrations')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      try {
        await db.query(readFileSync(join(dir, file), 'utf8'))
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err })
      }
    }
  } finally {
    await db.end()
  }

  project.provide('dbUrl', dbUrl)
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string
  }
}
