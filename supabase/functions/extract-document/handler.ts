// extract-document request logic (plan T4.3, ADR 0002). No Deno or npm imports here, so Vitest can test it.
// The extraction result is untrusted: it goes to raw columns through apply_extraction and never touches stock.
import type { ExtractionResult, Extractor } from '../_shared/extraction/types.ts'

export type DocumentRef = { id: string; shop_id: string; status: string; file_path: string | null; file_mime: string | null }

export type ExtractDeps = {
  getUserFromToken(token: string): Promise<{ id: string } | null>
  getDocument(id: string): Promise<DocumentRef | null>
  isMember(shopId: string, userId: string): Promise<boolean>
  download(path: string): Promise<Uint8Array>
  sha256(bytes: Uint8Array): Promise<string>
  extractor: Extractor
  apply(documentId: string, sha256: string, result: ExtractionResult): Promise<{ status: string; lines_added: number }>
}

export type ExtractRequest = { method: string; authorization: string | null; body: unknown }
export type ExtractResponse = { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (status: number, message: string): ExtractResponse => ({ status, body: { error: message } })

export async function handleExtract(req: ExtractRequest, deps: ExtractDeps): Promise<ExtractResponse> {
  if (req.method !== 'POST') return fail(405, 'Use POST.')
  const token = req.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail(401, 'Sign in first.')
  const user = await deps.getUserFromToken(token).catch(() => null)
  if (!user) return fail(401, 'Your session has expired. Sign in again.')

  const documentId = (req.body as { document_id?: unknown } | null)?.document_id
  if (typeof documentId !== 'string' || !UUID.test(documentId)) return fail(400, 'Document is missing.')

  const doc = await deps.getDocument(documentId)
  // Same answer for "missing" and "not yours", so ids of other shops are not confirmed.
  if (!doc || !(await deps.isMember(doc.shop_id, user.id))) return fail(404, 'Document not found.')
  if (doc.status !== 'draft') return fail(409, 'Only a draft can be read again.')
  if (!doc.file_path || !doc.file_path.startsWith(`${doc.shop_id}/${doc.id}/`)) return fail(400, 'Upload the document file first.')

  const bytes = await deps.download(doc.file_path)
  const sha256 = await deps.sha256(bytes)

  let result: ExtractionResult
  try {
    result = await deps.extractor.extract(bytes, doc.file_mime ?? 'application/octet-stream')
  } catch {
    // Details stay in the function logs.
    result = { status: 'failed', provider: deps.extractor.provider, message: 'The document could not be read. Enter the lines by hand.' }
  }

  const applied = await deps.apply(doc.id, sha256, result)
  return {
    status: 200,
    body: {
      status: applied.status,
      provider: result.provider,
      lines_added: applied.lines_added,
      message: result.status === 'done' ? null : result.message,
    },
  }
}
