import { describe, expect, it } from 'vitest'
import { safeFileName, uploadProblem } from './upload'

describe('uploadProblem (R-DOC-1)', () => {
  it('accepts photos and PDFs up to 15 MB', () => {
    expect(uploadProblem({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(uploadProblem({ name: 'a.pdf', type: 'application/pdf', size: 15 * 1024 * 1024 })).toBeNull()
    expect(uploadProblem({ name: 'IMG_1.HEIC', type: '', size: 10 })).toBeNull()
  })

  it('refuses other types, empty files, and large files', () => {
    expect(uploadProblem({ name: 'a.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 })).toMatch(/photo/)
    expect(uploadProblem({ name: 'a.png', type: 'image/png', size: 0 })).toMatch(/empty/)
    expect(uploadProblem({ name: 'a.png', type: 'image/png', size: 15 * 1024 * 1024 + 1 })).toMatch(/15 MB/)
  })
})

describe('safeFileName', () => {
  it('keeps a readable base and the extension', () => {
    const now = new Date(1_000)
    expect(safeFileName('Invoice #12 (Bayan).JPG', now)).toBe('1000-Invoice-12-Bayan.jpg')
    expect(safeFileName('../../etc/passwd', now)).toBe('1000-etc-passwd')
    expect(safeFileName('photo.jpeg.exe-x', now)).toBe('1000-photo-jpeg-exe-x')
    expect(safeFileName('', now)).toBe('1000-document')
  })
})
