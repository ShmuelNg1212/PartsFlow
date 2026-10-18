# Local PaddleOCR synthetic evaluation (measured)

Date: 2026-10-18. Plan: [local PaddleOCR](../plan/1792314680_real_invoice_extraction.md), task P2.
Reader: PaddleOCR 3.7.0 text pipeline, PP-OCRv6_medium models, CPU, on this Mac. Mapper: `supabase/functions/_shared/extraction/paddle.ts`.
Command: start `ocr/worker.py`, then run `node scripts/eval-local-ocr.ts`. Every read below is actual inference through the worker.

## How to read this

- All documents are synthetic. Real-shop accuracy is unknown.
- The generated cases were used while the mapper was built. Their scores show fit, not general accuracy.
- The demo samples were held out for the first run. That run found no lines, because the OCR merged "Qty Unit" headers and "20 pc" cells and the totals label had no colon. The mapper was then fixed, and the samples became development data too. The scores below are after the fix.
- Counterparty scores are low by design. The mapper reads a supplier only from an explicit label. An unlabelled heading is not used.
- The poor rotated photo produces no lines by design. More than a quarter of its text lines have low confidence. Only clearly labelled header values are kept.
- Two held-out descriptions differ because of OCR character errors ("50OML", "NS4OZL"). The owner corrects these during review.

## Generated cases (used while building the mapper)

Date: 2026-10-18. Provider: paddleocr-local. Dataset: Synthetic.
Documents: 6; read: 6; failed/unavailable: 0; omitted: 0.
Lines: expected 10; extracted 8; missing 2; extra 0.

| Field | Present-value match | Expected absent: correctly absent | Unspecified reference values |
|---|---|---|---|
| header.doc_number | 100.0% (5/5) | 1/1 | 0 |
| header.doc_date | 100.0% (5/5) | 1/1 | 0 |
| header.counterparty | 16.7% (1/6) | 0/0 | 0 |
| header.counterparty.normalized | 16.7% (1/6) | 0/0 | 0 |
| header.subtotal | 80.0% (4/5) | 1/1 | 0 |
| header.tax | 80.0% (4/5) | 1/1 | 0 |
| header.total | 83.3% (5/6) | 0/0 | 0 |
| header.currency | 83.3% (5/6) | 0/0 | 0 |
| line.description | 80.0% (8/10) | 0/0 | 0 |
| line.part_number | 77.8% (7/9) | 1/1 | 0 |
| line.quantity | 80.0% (8/10) | 0/0 | 0 |
| line.unit | 80.0% (8/10) | 0/0 | 0 |
| line.unit_price | 80.0% (8/10) | 0/0 | 0 |
| line.discount | 80.0% (8/10) | 0/0 | 0 |
| line.amount | 80.0% (8/10) | 0/0 | 0 |
| line.description.normalized | 80.0% (8/10) | 0/0 | 0 |
| line.unit.normalized | 80.0% (8/10) | 0/0 | 0 |

| Document | Status | Expected outcome | Error |
|---|---|---|---|
| readable-invoice.pdf | done | extract |  |
| phone-photo.jpg | done | extract |  |
| missing-fields.pdf | done | extract |  |
| multi-line-discounts.pdf | done | extract |  |
| poor-rotated-photo.jpg | done | extract |  |
| three-page-invoice.pdf | done | extract |  |

Every reference document is included in the field denominators. Failed and omitted reads earn no matches, including absent-field matches.
Exact text comparisons preserve case, punctuation, and spacing. Only rows marked normalized ignore text case and repeated whitespace. Product codes are never normalized. Decimal values compare without rounding; trailing zeros do not change their value.
Null means a known absent reference field. Omitted reference fields are unscored. Correct absences do not increase present-value accuracy. A missing line is not a correctly absent field.
Lines are compared by position. Missing or extra lines can shift later comparisons. Extra lines are counted separately and must be reviewed.
Counterparty means supplier for receipts and customer for sales. Legacy references without direction use supplier.
Check brand, discount, product identity, and unit conversion against the original. Field scores do not confirm a product match or authorize a stock movement.
Synthetic results test this dataset only. Real-shop accuracy is unknown.

| Document | Status | Lines | Seconds |
|---|---|---|---|
| readable-invoice.pdf | done | 2 | 9.5 |
| phone-photo.jpg | done | 1 | 6.9 |
| missing-fields.pdf | done | 1 | 7.5 |
| multi-line-discounts.pdf | done | 3 | 10.9 |
| poor-rotated-photo.jpg | done | 0 | 6.9 |
| three-page-invoice.pdf | done | 1 | 21.9 |

## Bundled demo samples (held out; a different layout)

Date: 2026-10-18. Provider: paddleocr-local. Dataset: Synthetic.
Documents: 3; read: 3; failed/unavailable: 0; omitted: 0.
Lines: expected 12; extracted 12; missing 0; extra 0.

| Field | Present-value match | Expected absent: correctly absent | Unspecified reference values |
|---|---|---|---|
| header.doc_number | 100.0% (3/3) | 0/0 | 0 |
| header.doc_date | 100.0% (3/3) | 0/0 | 0 |
| header.counterparty | 0.0% (0/3) | 0/0 | 0 |
| header.counterparty.normalized | 0.0% (0/3) | 0/0 | 0 |
| header.subtotal | n/a (no present reference values) | 3/3 | 0 |
| header.tax | n/a (no present reference values) | 3/3 | 0 |
| header.total | 100.0% (3/3) | 0/0 | 0 |
| header.currency | 100.0% (3/3) | 0/0 | 0 |
| line.description | 83.3% (10/12) | 0/0 | 0 |
| line.part_number | 100.0% (12/12) | 0/0 | 0 |
| line.quantity | 100.0% (12/12) | 0/0 | 0 |
| line.unit | 100.0% (12/12) | 0/0 | 0 |
| line.unit_price | 100.0% (12/12) | 0/0 | 0 |
| line.discount | n/a (no present reference values) | 0/0 | 12 |
| line.amount | 100.0% (12/12) | 0/0 | 0 |
| line.description.normalized | 83.3% (10/12) | 0/0 | 0 |
| line.unit.normalized | 100.0% (12/12) | 0/0 | 0 |

| Document | Status | Expected outcome | Error |
|---|---|---|---|
| sample-invoice-bayan-0412.png | done | extract |  |
| sample-invoice-masagana-7781.png | done | extract |  |
| sample-invoice-bayan-0419.pdf | done | extract |  |

Every reference document is included in the field denominators. Failed and omitted reads earn no matches, including absent-field matches.
Exact text comparisons preserve case, punctuation, and spacing. Only rows marked normalized ignore text case and repeated whitespace. Product codes are never normalized. Decimal values compare without rounding; trailing zeros do not change their value.
Null means a known absent reference field. Omitted reference fields are unscored. Correct absences do not increase present-value accuracy. A missing line is not a correctly absent field.
Lines are compared by position. Missing or extra lines can shift later comparisons. Extra lines are counted separately and must be reviewed.
Counterparty means supplier for receipts and customer for sales. Legacy references without direction use supplier.
Check brand, discount, product identity, and unit conversion against the original. Field scores do not confirm a product match or authorize a stock movement.
Synthetic results test this dataset only. Real-shop accuracy is unknown.

| Document | Status | Lines | Seconds |
|---|---|---|---|
| sample-invoice-bayan-0412.png | done | 4 | 7.7 |
| sample-invoice-masagana-7781.png | done | 3 | 7.2 |
| sample-invoice-bayan-0419.pdf | done | 5 | 10.8 |
