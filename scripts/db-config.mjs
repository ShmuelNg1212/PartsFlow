// Builds a pg connection config from SUPABASE_DB_URL without URL parsing, so passwords with
// unencoded special characters still work. Never prints the password.
import { readFileSync } from 'node:fs'

export function loadEnvLocal(path = '.env.local') {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch {
    // No .env.local: rely on the environment.
  }
}

export function dbConfig(raw = process.env.SUPABASE_DB_URL) {
  if (!raw) throw new Error('SUPABASE_DB_URL is not set (see .env.example).')
  const m = raw.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?]+)(?:\?.*)?$/)
  if (!m) throw new Error('SUPABASE_DB_URL is not in the form postgresql://user:password@host:port/database')
  const [, user, rawPassword, host, port, database] = m
  let password = rawPassword
  // The dashboard template shows "[YOUR-PASSWORD]"; a password pasted inside the brackets keeps them.
  if (/^\[.*\]$/.test(password)) {
    console.warn('Note: SUPABASE_DB_URL password is wrapped in [ ]. Using it without the brackets; remove them in .env.local.')
    password = password.slice(1, -1)
  }
  return { user: decodeURIComponent(user), password, host, port: Number(port ?? 5432), database, ssl: { rejectUnauthorized: false } }
}
