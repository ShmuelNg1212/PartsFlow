/** Same rule as public.normalize_part_number: drop spaces, dashes, dots, slashes; upper case. Comparison only. */
export function normalizePartNumber(text: string): string {
  return text.replace(/[\s\-./]/g, '').toUpperCase()
}
