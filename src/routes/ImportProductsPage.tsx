import { ArrowLeftIcon, FileArrowUpIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { importProducts, keys } from '@/api/api'
import { PageHeader } from '@/components/app/PageHeader'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { parseProductCsv, type ParseResult } from '@/features/import/productCsv'
import { downloadText } from '@/lib/download'
import { toAppError } from '@/lib/errors'
import { useShop } from '@/shop/ShopProvider'

const TEMPLATE = 'sku,part_number,description,brand,base_unit,selling_price,reorder_threshold,shelf_bin,opening_qty\nSP-0001,BKR6E-11,Spark plug,NGK,pc,180.00,10,A-01,24\n'

/** R-PROD-2: preview with per-row errors; nothing is written until the owner confirms. */
export function ImportProductsPage() {
  const { shop, isOwner } = useShop()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<Map<number, string[]>>(new Map())

  const commit = useMutation({
    mutationFn: () =>
      importProducts(
        shop.id,
        result!.rows.map((r) => r.value),
      ),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
      toast.success(`Imported ${r.inserted} products.`)
      navigate('/inventory')
    },
    onError: (err) => {
      const appError = toAppError(err)
      if (appError.kind === 'invalid' && appError.rows?.length && result) {
        // The server numbers rows from 1 in the order sent; map them back to file lines.
        setServerErrors(new Map(appError.rows.map((r) => [result.rows[r.row - 1]?.line ?? r.row, r.errors])))
        setOnlyErrors(true)
      }
    },
  })

  const rows = useMemo(() => {
    if (!result) return []
    const merged = result.rows.map((r) => ({ ...r, errors: [...r.errors, ...(serverErrors.get(r.line) ?? [])] }))
    return onlyErrors ? merged.filter((r) => r.errors.length > 0) : merged
  }, [result, serverErrors, onlyErrors])

  if (!isOwner) return <Navigate to="/inventory" replace />

  const invalidCount = result ? result.rows.length - result.validCount : 0
  const ready = !!result && !result.fileError && result.missingColumns.length === 0 && result.rows.length > 0 && invalidCount === 0 && serverErrors.size === 0

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/inventory" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Inventory
      </Link>
      <PageHeader
        title="Import products"
        description="Upload a CSV file. You see every row and its problems first. Nothing is saved until you confirm, and then all rows are saved together or none."
        actions={
          <Button variant="outline" onClick={() => downloadText('partsflow-products-template.csv', TEMPLATE)}>
            Download template
          </Button>
        }
      />

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center hover:bg-accent/50">
        <FileArrowUpIcon className="size-7 text-muted-foreground" />
        <span className="font-medium">{fileName ?? 'Choose a CSV file'}</span>
        <span className="text-sm text-muted-foreground">
          Required columns: sku, part_number, description, brand. Optional: base_unit, selling_price, reorder_threshold, shelf_bin, opening_qty.
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="CSV file"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setFileName(file.name)
            setServerErrors(new Map())
            setOnlyErrors(false)
            setResult(parseProductCsv(await file.text()))
          }}
        />
      </label>

      {result && (
        <div className="mt-6 space-y-4">
          {result.fileError && <Problem>{result.fileError}</Problem>}
          {result.missingColumns.length > 0 && <Problem>The file has no column for: {result.missingColumns.join(', ')}.</Problem>}
          {result.unknownColumns.length > 0 && (
            <p className="text-sm text-muted-foreground">These columns are ignored: {result.unknownColumns.join(', ')}.</p>
          )}
          {commit.isError && toAppError(commit.error).kind !== 'invalid' && <Problem>{toAppError(commit.error).message}</Problem>}

          {result.rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">
                  <span className="font-medium">{result.rows.length}</span> rows ·{' '}
                  <span className="text-green-fg">{result.validCount - serverErrors.size} ready</span>
                  {(invalidCount > 0 || serverErrors.size > 0) && <span className="text-red-fg"> · {invalidCount + serverErrors.size} with problems</span>}
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Show only rows with problems
                </label>
                <Button className="ml-auto" disabled={!ready || commit.isPending} onClick={() => commit.mutate()}>
                  {commit.isPending ? 'Importing…' : `Import ${result.rows.length} products`}
                </Button>
              </div>
              {!ready && invalidCount + serverErrors.size > 0 && (
                <p className="text-sm text-muted-foreground">Fix the rows with problems in the file, then choose it again.</p>
              )}
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs text-muted-foreground">
                    <tr>
                      {['Line', 'SKU', 'Part number', 'Description', 'Brand', 'Unit', 'Price', 'Reorder', 'Shelf', 'Opening', 'Check'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 1000).map((r) => (
                      <tr key={r.line} className={r.errors.length ? 'border-b border-border bg-red-bg/40 align-top' : 'border-b border-border align-top'}>
                        <td className="num px-3 py-2 text-muted-foreground">{r.line}</td>
                        <td className="num px-3 py-2">{r.value.sku}</td>
                        <td className="num px-3 py-2 break-all">{r.value.part_number}</td>
                        <td className="max-w-64 px-3 py-2 break-words">{r.value.description}</td>
                        <td className="px-3 py-2">{r.value.brand}</td>
                        <td className="px-3 py-2">{r.value.base_unit}</td>
                        <td className="num px-3 py-2">{r.value.selling_price}</td>
                        <td className="num px-3 py-2">{r.value.reorder_threshold}</td>
                        <td className="px-3 py-2">{r.value.shelf_bin}</td>
                        <td className="num px-3 py-2">{r.value.opening_qty}</td>
                        <td className="min-w-56 px-3 py-2">
                          {r.errors.length === 0 ? (
                            <StatusBadge tone="green">OK</StatusBadge>
                          ) : (
                            <ul className="space-y-0.5 text-xs text-red-fg">
                              {r.errors.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 1000 && <p className="text-sm text-muted-foreground">The preview shows the first 1000 rows. All rows are checked and imported.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
      {children}
    </p>
  )
}
