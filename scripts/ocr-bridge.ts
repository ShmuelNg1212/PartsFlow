// Usage: OCR_WORKER_TOKEN=... node scripts/ocr-bridge.ts
// Local OCR bridge for development (plan P3). Listens on 127.0.0.1:8766. The Vite dev server
// proxies /local-ocr to it when VITE_LOCAL_OCR=true. Refuses to start for any project but development.
import { createServer } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { sha256Hex } from '../supabase/functions/_shared/extraction/demo.ts'
import { localPaddleExtractor, workerReader } from '../supabase/functions/_shared/extraction/paddle.ts'
import { dbConfig, loadEnvLocal } from './db-config.mjs'
import { checkDevConfig, makeBridgeHandler, WORKER_TIMEOUT_MS } from './ocr-bridge-lib.ts'

loadEnvLocal()
const config = checkDevConfig(process.env)
const port = Number(process.env.OCR_BRIDGE_PORT ?? 8766)
const pool = new pg.Pool({ ...dbConfig(config.dbUrl), max: 2 })
const extractor = localPaddleExtractor({ read: workerReader({ url: config.workerUrl, token: config.workerToken, timeoutMs: WORKER_TIMEOUT_MS }) })

const handle = makeBridgeHandler({
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  async workerHealth() {
    const res = await fetch(`${config.workerUrl}/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok && (await res.json()).ready === true
  },
  makeDeps(token) {
    // Auth checks the session; Storage reads run as the signed-in user, so storage policies still apply.
    const asUser = createClient(config.supabaseUrl, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    return {
      async getUserFromToken(t) {
        const { data, error } = await asUser.auth.getUser(t)
        return error || !data.user ? null : { id: data.user.id }
      },
      async getDocument(id) {
        const { rows } = await pool.query('select id, shop_id, status, file_path, file_mime from public.documents where id = $1', [id])
        return rows[0] ?? null
      },
      async isMember(shopId, userId) {
        const { rowCount } = await pool.query('select 1 from public.memberships where shop_id = $1 and user_id = $2', [shopId, userId])
        return (rowCount ?? 0) > 0
      },
      async download(path) {
        const { data, error } = await asUser.storage.from('documents').download(path)
        if (error || !data) throw error ?? new Error('download failed')
        return new Uint8Array(await data.arrayBuffer())
      },
      sha256: sha256Hex,
      extractor,
      async apply(documentId, sha256, result) {
        const { rows } = await pool.query('select public.apply_extraction($1::uuid, $2, $3::jsonb) as r', [documentId, sha256, JSON.stringify(result)])
        return rows[0].r as { status: string; lines_added: number }
      },
    }
  },
})

createServer((req, res) => {
  let raw = ''
  req.setEncoding('utf8')
  req.on('data', (chunk: string) => { raw += chunk; if (raw.length > 4096) req.destroy() })
  req.on('end', async () => {
    try {
      const out = await handle({ method: req.method ?? 'GET', path: (req.url ?? '/').split('?')[0]!, origin: req.headers.origin, authorization: req.headers.authorization, rawBody: raw })
      res.writeHead(out.status, { ...out.headers, ...(out.body ? { 'Content-Type': 'application/json' } : {}) })
      res.end(out.body ? JSON.stringify(out.body) : undefined)
    } catch (err) {
      // Details stay in this terminal. No document content is logged.
      console.error('local OCR bridge failed:', err instanceof Error ? err.message : err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'The document could not be processed. Try again, or enter the lines by hand.' }))
    }
  })
}).listen(port, '127.0.0.1', () => console.log(`Local OCR bridge on http://127.0.0.1:${port} (development project only)`))
