// Edge Function: extract-document (plan T4.3, ADR 0002, R-EXT-1..4).
// Deployed with verify_jwt = false: the handler checks the caller's session with Auth.
// Provider: the labelled demo extractor. Local document reading is planned separately.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { demoExtractor, sha256Hex } from '../_shared/extraction/demo.ts'
import { handleExtract, type ExtractDeps } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const secretKey = secretKeys ? JSON.parse(secretKeys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

const extractor = demoExtractor()

const allowedOrigins = (Deno.env.get('APP_ORIGINS') ?? 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean)

const deps: ExtractDeps = {
  async getUserFromToken(token) {
    const { data, error } = await admin.auth.getUser(token)
    return error || !data.user ? null : { id: data.user.id }
  },
  async getDocument(id) {
    const { data, error } = await admin.from('documents').select('id, shop_id, status, file_path, file_mime').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },
  async isMember(shopId, userId) {
    const { data, error } = await admin.from('memberships').select('role').eq('shop_id', shopId).eq('user_id', userId).maybeSingle()
    if (error) throw error
    return !!data
  },
  async download(path) {
    const { data, error } = await admin.storage.from('documents').download(path)
    if (error || !data) throw error ?? new Error('download failed')
    return new Uint8Array(await data.arrayBuffer())
  },
  sha256: sha256Hex,
  extractor,
  async apply(documentId, sha256, result) {
    const { data, error } = await admin.rpc('apply_extraction', { p_document_id: documentId, p_sha256: sha256, p_result: result })
    if (error) throw error
    return data as { status: string; lines_added: number }
  },
}

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  try {
    const body = await req.json().catch(() => null)
    const result = await handleExtract({ method: req.method, authorization: req.headers.get('authorization'), body }, deps)
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { ...cors(origin), 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('extract-document failed', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: 'The document could not be processed. Try again, or enter the lines by hand.' }), {
      status: 500,
      headers: { ...cors(origin), 'Content-Type': 'application/json' },
    })
  }
})
