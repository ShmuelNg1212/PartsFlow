// Azure AI Document Intelligence adapter, model prebuilt-invoice, api-version 2024-11-30 (plan T4.4, R-EXT-2).
// Field names follow Microsoft's published invoice schema. Items have no discount field, so discount stays null.
import { missing, normalizeDecimal, numberToDecimal, type ExtractedLine, type ExtractionResult, type Extractor, type Field } from './types.ts'

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
  const doc = (response as { analyzeResult?: { documents?: { fields?: Record<string, AzureField> }[] } })?.analyzeResult?.documents?.[0]
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
    async extract(file: Uint8Array): Promise<ExtractionResult> {
      const url = `${base}/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=${AZURE_API_VERSION}`
      const start = await doFetch(url, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': opts.key, 'Content-Type': 'application/octet-stream' },
        body: file,
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
