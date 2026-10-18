// Upload rules (plan T4.1, R-DOC-1). The bucket enforces the same limits on the server.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const
export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif'

/** Some browsers report HEIC photos with an empty type; fall back to the extension. */
export function fileType(file: { name: string; type: string }): string {
  if (file.type) return file.type
  const ext = file.name.toLowerCase().split('.').pop()
  return ext === 'heic' ? 'image/heic' : ext === 'heif' ? 'image/heif' : ext === 'pdf' ? 'application/pdf' : ''
}

export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  const type = fileType(file)
  if (!(ACCEPTED_TYPES as readonly string[]).includes(type)) return 'Use a photo (JPEG, PNG, WebP, HEIC) or a PDF.'
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_UPLOAD_BYTES) return 'The file is larger than 15 MB. Take the photo again at a lower resolution, or split the PDF.'
  return null
}

/** A storage-safe name that keeps the extension: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string, now: Date = new Date()): string {
  const match = name.match(/^(.*)\.([A-Za-z0-9]{1,5})$/)
  const rawBase = match ? match[1]! : name
  const ext = match ? match[2]!.toLowerCase() : ''
  const base =
    rawBase
      .normalize('NFKD')
      .replace(/[^\w-]+/g, '-')
      .replace(/^[-.]+|-+$/g, '')
      .slice(0, 60) || 'document'
  return `${now.getTime()}-${base}${ext ? `.${ext}` : ''}`
}
