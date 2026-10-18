// R-EXT-2. Sends each supplied invoice to Azure and writes measured results.
// Usage: AZURE_DOCINTEL_ENDPOINT=... AZURE_DOCINTEL_KEY=... node scripts/eval-extraction.ts <folder>
// truth.json: { schema_version: 1, synthetic: true|false, cases: [{ file, mime_type, direction, truth }] }
// Legacy case arrays require --synthetic or --real to label the report.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { azureExtractor } from '../supabase/functions/_shared/extraction/azure.ts'
import { evaluateExtractions, type EvaluationCase, type EvaluationRead } from '../supabase/functions/_shared/extraction/evaluation.ts'

const folderArgument = process.argv[2]
const endpoint = process.env.AZURE_DOCINTEL_ENDPOINT
const key = process.env.AZURE_DOCINTEL_KEY
if (!folderArgument || !endpoint || !key) {
  console.error('Usage: AZURE_DOCINTEL_ENDPOINT=... AZURE_DOCINTEL_KEY=... node scripts/eval-extraction.ts <folder>')
  process.exit(1)
}
const folder = realpathSync(resolve(folderArgument))
const input: unknown = JSON.parse(readFileSync(join(folder, 'truth.json'), 'utf8'))
const manifest = input as { schema_version?: number; synthetic?: boolean; cases?: EvaluationCase[] }
const cases = Array.isArray(input) ? input as EvaluationCase[] : manifest.cases
const synthetic = Array.isArray(input) ? (process.argv.includes('--synthetic') ? true : process.argv.includes('--real') ? false : undefined) : manifest.synthetic
if (!cases?.length || typeof synthetic !== 'boolean' || (!Array.isArray(input) && manifest.schema_version !== 1)) {
  throw new Error('Provide a nonempty version 1 manifest with an explicit synthetic boolean. Legacy arrays require --synthetic or --real.')
}
if (cases.some((entry) => typeof entry.file !== 'string' || !entry.truth || !Array.isArray(entry.truth.lines))) throw new Error('Each case needs a file name and reference lines.')
// Validate unique references before making any billable requests.
evaluateExtractions(cases, [], { synthetic, date: new Date().toISOString() })
const mimeTypes: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heif' }
const extractor = azureExtractor({ endpoint, key })
const reads: EvaluationRead[] = []
for (const entry of cases) {
  try {
    const filePath = realpathSync(resolve(folder, entry.file))
    const within = relative(folder, filePath)
    if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error('Invoice path must remain inside the evaluation folder.')
    const mime = entry.mime_type ?? mimeTypes[extname(entry.file).toLowerCase()]
    if (!mime) throw new Error('Provide a MIME type for this file.')
    const result = await extractor.extract(new Uint8Array(readFileSync(filePath)), mime)
    reads.push(result.status === 'done' ? { file: entry.file, status: 'done', result } : { file: entry.file, status: result.status, message: result.message })
  } catch {
    // Do not serialize provider exceptions. They may contain request URLs or credentials.
    reads.push({ file: entry.file, status: 'failed', message: 'Could not safely read the local file or complete the extraction request.' })
  }
  console.log(`${entry.file}: ${reads.at(-1)!.status}`)
}
const report = evaluateExtractions(cases, reads, { synthetic, date: new Date().toISOString() })
writeFileSync(join(folder, 'evaluation.md'), report.markdown)
writeFileSync(join(folder, 'evaluation.json'), JSON.stringify(report, null, 2))
// Raw provider output stays local for reference checks. Do not commit real invoice output.
writeFileSync(join(folder, 'extraction-results.json'), JSON.stringify(reads, null, 2))
console.log(report.markdown)
