// Demo extractor (plan T4.2, R-EXT-4). It recognizes the bundled synthetic sample files by SHA-256 and returns
// prepared results. It reads nothing from the image. Any other file gets "not available".
import { DEMO_FIXTURES } from './demo-fixtures.ts'
import type { ExtractionResult, Extractor } from './types.ts'

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function demoExtractor(): Extractor {
  return {
    provider: 'demo',
    async extract(file: Uint8Array): Promise<ExtractionResult> {
      const hit = DEMO_FIXTURES[await sha256Hex(file)]
      if (!hit) {
        return {
          status: 'not_available',
          provider: 'demo',
          message: 'Automatic reading is not set up. The demo reads only the bundled sample invoices. Enter the lines by hand.',
        }
      }
      // A copy, so callers cannot change the shared fixture.
      return structuredClone(hit.result)
    },
  }
}
