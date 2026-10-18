// CSV export (plan T3.4, R-ACT-1). Decimals are written exactly as the database returned them (R-DATA-3).

export type Column<Row> = { key: keyof Row & string; header: string; kind: 'text' | 'decimal' }

const DECIMAL = /^-?\d+(\.\d+)?$/
// A spreadsheet runs a cell that starts with one of these as a formula.
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: unknown, kind: 'text' | 'decimal', header: string): string {
  if (value === null || value === undefined || value === '') return ''
  let text = String(value)
  if (kind === 'decimal') {
    if (!DECIMAL.test(text)) throw new Error(`${header}: "${text}" is not a decimal`)
    return text
  }
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv<Row extends Record<string, unknown>>(columns: Column<Row>[], rows: Row[]): string {
  const lines = [columns.map((c) => cell(c.header, 'text', c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key], c.kind, c.header)).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
