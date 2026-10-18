// Local OCR bridge logic (plan P3, ADR 0002, ADR 0005). Development only.
// It reuses handleExtract, so the access checks and the privileged apply step match the hosted function.
// No server credential leaves this process. The browser reaches it only through the Vite dev proxy.
import { handleExtract, type ExtractDeps } from '../supabase/functions/extract-document/handler.ts'

export const DEV_PROJECT_REF = 'urljzpqigvtoooitwjrd'
export const DEFAULT_WORKER_URL = 'http://127.0.0.1:8765'
/** From P1 timings: a three-page PDF took about 22 s on CPU. */
export const WORKER_TIMEOUT_MS = 120_000
const MAX_BODY = 1024

export type BridgeConfig = { supabaseUrl: string; publishableKey: string; dbUrl: string; workerUrl: string; workerToken: string }

/** Refuses anything but the development project and a loopback worker. */
export function checkDevConfig(env: Record<string, string | undefined>): BridgeConfig {
  const supabaseUrl = env.VITE_SUPABASE_URL ?? ''
  const dbUrl = env.SUPABASE_DB_URL ?? ''
  const workerUrl = env.OCR_WORKER_URL ?? DEFAULT_WORKER_URL
  const workerToken = env.OCR_WORKER_TOKEN ?? ''
  if (env.SUPABASE_PROJECT_REF !== DEV_PROJECT_REF) throw new Error(`The local bridge runs only against the development project ${DEV_PROJECT_REF}.`)
  if (supabaseUrl !== `https://${DEV_PROJECT_REF}.supabase.co`) throw new Error('VITE_SUPABASE_URL is not the development project.')
  // The pooler user is postgres.<ref>; a direct connection uses host db.<ref>.supabase.co.
  const db = dbUrl.match(/^postgres(?:ql)?:\/\/([^:]+):.*@([^@/:]+)(?::\d+)?\/[^?]+(?:\?.*)?$/)
  if (!db || !(db[1] === `postgres.${DEV_PROJECT_REF}` || db[2] === `db.${DEV_PROJECT_REF}.supabase.co`)) throw new Error('SUPABASE_DB_URL is not the development project.')
  if (!env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is not set.')
  if (workerToken.length < 32) throw new Error('OCR_WORKER_TOKEN must have at least 32 characters.')
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(workerUrl)) throw new Error('OCR_WORKER_URL must be a loopback address.')
  return { supabaseUrl, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY, dbUrl, workerUrl, workerToken }
}

export type BridgeRequest = { method: string; path: string; origin: string | undefined; authorization: string | undefined; rawBody: string }
export type BridgeResponse = { status: number; headers: Record<string, string>; body: Record<string, unknown> | null }

export function makeBridgeHandler(opts: {
  allowedOrigins: string[]
  workerHealth(): Promise<boolean>
  /** Builds the request's dependencies. The session token lets Storage reads run as the user. */
  makeDeps(token: string): ExtractDeps
}) {
  return async (req: BridgeRequest): Promise<BridgeResponse> => {
    const allowed = !req.origin || opts.allowedOrigins.includes(req.origin)
    const cors: Record<string, string> = req.origin && allowed
      ? { 'Access-Control-Allow-Origin': req.origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
      : {}
    const reply = (status: number, body: Record<string, unknown> | null): BridgeResponse => ({ status, headers: cors, body })

    if (req.method === 'GET' && req.path === '/health') return reply(200, { bridge: true, scanner: await opts.workerHealth().catch(() => false) })
    if (req.path !== '/extract') return reply(404, { error: 'Not found.' })
    if (!allowed) return reply(403, { error: 'This origin may not use the local scanner.' })
    if (req.method === 'OPTIONS') return reply(204, null)
    if (req.rawBody.length > MAX_BODY) return reply(413, { error: 'Request too large.' })

    let body: unknown
    try { body = JSON.parse(req.rawBody) } catch { body = null }
    const token = req.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? ''
    const result = await handleExtract({ method: req.method, authorization: req.authorization ?? null, body }, opts.makeDeps(token))
    return reply(result.status, result.body)
  }
}
