import type pg from 'pg'

export function loadEnvLocal(path?: string): void
export function dbConfig(raw?: string): pg.PoolConfig
