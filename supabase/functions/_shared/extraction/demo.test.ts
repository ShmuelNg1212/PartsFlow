import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { demoExtractor, sha256Hex } from './demo'

// T4.2, R-EXT-4: the demo extractor works on the bundled synthetic samples only, and says so.

const sample = new Uint8Array(readFileSync('public/samples/sample-invoice-bayan-0412.png'))

describe('demoExtractor', () => {
  it('returns the prepared result for a bundled sample, labelled demo', async () => {
    const result = await demoExtractor().extract(sample, 'image/png')
    expect(result.status).toBe('done')
    if (result.status !== 'done') return
    expect(result.provider).toBe('demo')
    expect(result.doc_number.value).toBe('BAS-0412')
    expect(result.lines).toHaveLength(4)
    expect(result.lines[2]!.unit).toEqual({ value: 'btl', confidence: 0.55 })
  })

  it('refuses any other file', async () => {
    const result = await demoExtractor().extract(new Uint8Array([1, 2, 3]), 'image/png')
    expect(result).toMatchObject({ status: 'not_available', provider: 'demo' })
    if (result.status === 'not_available') expect(result.message).toMatch(/enter/i)
  })

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
