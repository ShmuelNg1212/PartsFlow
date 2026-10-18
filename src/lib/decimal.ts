import Decimal from 'decimal.js'

// Quantities are numeric(14,3) and money numeric(14,2) in the database (R-DATA-3).
// The server value is the truth; this module only mirrors its arithmetic for display.
export const QTY_SCALE = 3
export const MONEY_SCALE = 2

export function toDecimal(value: string | number | Decimal | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0)
  return new Decimal(value)
}

/** Base-unit quantity = quantity × conversion factor, rounded to 3 places (same as post_document). */
export function baseQuantity(qty: string, factor: string): string {
  return toDecimal(qty).times(toDecimal(factor)).toDecimalPlaces(QTY_SCALE, Decimal.ROUND_HALF_UP).toFixed(QTY_SCALE)
}

export function formatQty(value: string | number | Decimal | null | undefined): string {
  const d = toDecimal(value)
  // Drop trailing zeros so "5.000" reads as "5" and "2.500" as "2.5".
  return d.toDecimalPlaces(QTY_SCALE).toString()
}

export function formatMoney(value: string | number | Decimal | null | undefined, currency: string, locale?: string): string {
  const fixed = toDecimal(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP).toFixed(MONEY_SCALE)
  // Intl accepts a decimal string and formats it without converting through a float.
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(fixed as unknown as number)
}

/** True when the text is a valid decimal with at most `scale` places. Empty is not valid. */
export function isDecimalString(text: string, scale: number): boolean {
  const re = new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`)
  return re.test(text.trim())
}
