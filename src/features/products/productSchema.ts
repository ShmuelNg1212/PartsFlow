import { z } from 'zod'

const decimal = (label: string, scale: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`), `${label} must be a number, zero or more, with at most ${scale} decimals.`)

export const productSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required.').max(64),
  part_number: z.string().trim().min(1, 'Part number is required.').max(64),
  description: z.string().trim().min(1, 'Description is required.').max(300),
  brand: z.string().trim().min(1, 'Brand is required. Different brands are different products.').max(80),
  base_unit: z.string().trim().min(1, 'Base unit is required.').max(20),
  selling_price: decimal('Selling price', 2),
  reorder_threshold: decimal('Reorder threshold', 3),
  shelf_bin: z.string().trim().max(40),
  opening_qty: z.union([z.literal(''), decimal('Opening quantity', 3)]),
})

export type ProductFormValues = z.infer<typeof productSchema>

export const emptyProduct: ProductFormValues = {
  sku: '',
  part_number: '',
  description: '',
  brand: '',
  base_unit: 'pc',
  selling_price: '0',
  reorder_threshold: '0',
  shelf_bin: '',
  opening_qty: '',
}
