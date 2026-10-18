// Azure AI Document Intelligence adapter, model prebuilt-invoice, api-version 2024-11-30 (plan T4.4, R-EXT-2).
// Field names follow Microsoft's published invoice schema. Items have no discount field, so discount stays null.
import { missing, normalizeDecimal, numberToDecimal, type ExtractedLine, type ExtractionResult, type Extractor, type Field } from './types.ts'
import { PDFDocument } from 'pdf-lib'

export const AZURE_API_VERSION = '2024-11-30'

type AzureField = {
  type?: string
  content?: string
  confidence?: number
  valueString?: string
  valueDate?: string
  valueNumber?: number
  valueCurrency?: { amount?: number; currencyCode?: string; currencySymbol?: string }
  valueArray?: AzureField[]
  valueObject?: Record<string, AzureField>
}

const conf = (f: AzureField | undefined) => (typeof f?.confidence === 'number' ? f.confidence : null)

function text(f: AzureField | undefined): Field {
  if (!f) return missing()
  const value = (f.valueString ?? f.content ?? '').trim()
  return value ? { value, confidence: conf(f) } : missing()
}

function date(f: AzureField | undefined): Field {
  if (!f) return missing()
  const value = f.valueDate && /^\d{4}-\d{2}-\d{2}$/.test(f.valueDate) ? f.valueDate : (f.content?.trim() ?? '')
  return value ? { value, confidence: conf(f) } : missing()
}

/** Printed text first ("250.10"); the float only when the text is absent or unreadable. */
function decimal(f: AzureField | undefined): Field {
  if (!f) return missing()
  const fromText = normalizeDecimal(f.content)
  const value = fromText ?? numberToDecimal(f.valueCurrency?.amount ?? f.valueNumber)
  return value ? { value, confidence: conf(f) } : missing()
}

export function mapAzureInvoice(response: unknown): ExtractionResult {
  const docs = (response as { analyzeResult?: { documents?: { fields?: Record<string, AzureField> }[] } })?.analyzeResult?.documents
  if (docs && docs.length > 1) return { status: 'failed', provider: 'azure', message: 'Multiple invoices were found. Enter all lines by hand, or use one invoice per draft.' }
  const doc = docs?.[0]
  const fields = doc?.fields
  if (!fields) return { status: 'failed', provider: 'azure', message: 'No invoice was found in the document.' }

  const lines: ExtractedLine[] = (fields.Items?.valueArray ?? []).map((item) => {
    const o = item.valueObject ?? {}
    return {
      description: text(o.Description),
      part_number: text(o.ProductCode),
      quantity: decimal(o.Quantity),
      unit: text(o.Unit),
      unit_price: decimal(o.UnitPrice),
      discount: missing(),
      amount: decimal(o.Amount),
    }
  })

  return {
    status: 'done',
    provider: 'azure',
    doc_number: text(fields.InvoiceId),
    doc_date: date(fields.InvoiceDate),
    vendor_name: text(fields.VendorName),
    customer_name: text(fields.CustomerName),
    totals: {
      subtotal: decimal(fields.SubTotal),
      tax: decimal(fields.TotalTax),
      total: decimal(fields.InvoiceTotal),
      currency: fields.InvoiceTotal?.valueCurrency?.currencyCode ?? null,
    },
    lines,
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Calls Azure: POST analyze, then poll the Operation-Location until it finishes. */
export function azureExtractor(opts: { endpoint: string; key: string; fetch?: Fetch; pollMs?: number; timeoutMs?: number }): Extractor {
  const doFetch = opts.fetch ?? fetch
  const base = opts.endpoint.replace(/\/+$/, '')
  return {
    provider: 'azure',
    async extract(file: Uint8Array, mime: string): Promise<ExtractionResult> {
      if (file.byteLength === 0) return { status: 'failed', provider: 'azure', message: 'The file is empty. Upload a readable copy, or enter the lines by hand.' }
      if (file.byteLength > 4_000_000) {
        return { status: 'not_available', provider: 'azure', message: 'Automatic reading is limited to 4 MB on the free tier. Your original is saved. Enter the lines by hand, or start a new draft with a smaller copy.' }
      }
      // Keep unsupported originals in Storage. Do not guess that Azure can read them.
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) {
        return { status: 'not_available', provider: 'azure', message: 'Automatic reading currently supports JPEG, PNG, or PDF. Your original is saved. Enter the lines by hand, or start a new draft with a supported copy.' }
      }
      // MIME is supplied with the upload. Azure detects bytes, so check them too.
      const header = new TextDecoder().decode(file.subarray(0, 1024))
      const detectedMime = header.includes('%PDF-') ? 'application/pdf'
        : [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => file[index] === byte) ? 'image/png'
          : file[0] === 255 && file[1] === 216 && file[2] === 255 ? 'image/jpeg' : null
      if (detectedMime !== mime) {
        return { status: 'failed', provider: 'azure', message: 'The file contents do not match the selected file type. Use a readable JPEG, PNG, or PDF, or enter the lines by hand. The original is saved.' }
      }
      if (mime === 'application/pdf') {
        try {
          const pdf = await PDFDocument.load(file, { updateMetadata: false })
          if (pdf.getPageCount() > 2) {
            return { status: 'not_available', provider: 'azure', message: 'Automatic reading is limited to two pages per PDF on the free tier. The full original is saved. Enter every line by hand, or start new drafts with smaller PDFs and check for duplicate entries.' }
          }
          if (pdf.getPageCount() === 0) throw new Error('No pages')
        } catch {
          return { status: 'failed', provider: 'azure', message: 'This PDF could not be checked. Use an unlocked, readable PDF, or enter the lines by hand. The original is saved.' }
        }
      }
      const url = `${base}/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=${AZURE_API_VERSION}`
      const start = await doFetch(url, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': opts.key, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(file).buffer,
      })
      const operation = start.headers.get('operation-location')
      if (start.status !== 202 || !operation) {
        return { status: 'failed', provider: 'azure', message: `Azure did not accept the document (HTTP ${start.status}).` }
      }
      const deadline = Date.now() + (opts.timeoutMs ?? 60_000)
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000))
        const poll = await doFetch(operation, { headers: { 'Ocp-Apim-Subscription-Key': opts.key } })
        const body = (await poll.json()) as { status?: string }
        if (body.status === 'succeeded') return mapAzureInvoice(body)
        if (body.status === 'failed') return { status: 'failed', provider: 'azure', message: 'Azure could not read the document.' }
      }
      return { status: 'failed', provider: 'azure', message: 'Azure took too long. Enter the lines by hand.' }
    },
  }
}
