# Real invoice reading

Date: 2026-10-18. Mode: technical.
Skills: mem-search, research, grilling. Supabase guidance applies to later server configuration.

## Request

Read uploaded files and photos of paper invoices. Fill the invoice workspace with useful business data. Update the dashboard after review and posting.

## Existing flow

- `NewDocumentDialog.tsx` supports file upload and phone camera capture.
- `upload.ts` accepts JPEG, PNG, WebP, HEIC, HEIF, and PDF. The limit is 15 MB.
- Private Storage keeps the original file.
- `extract-document` checks the session, shop membership, and draft status.
- The Azure adapter uses `prebuilt-invoice` with API version `2024-11-30`.
- Without both Azure settings, the function selects the labelled sample extractor.
- Neither local environment file has Azure settings. This check did not inspect hosted secrets.
- The workspace supports correction, uncertain-field marks, product selection, and manual entry.
- Only posting updates stock. Extraction remains a draft source under ADR 0002.
- The evaluation script compares headers and line descriptions, codes, quantities, and prices.
- It does not score all target fields. It compares lines by position and normalizes part-number punctuation.
- Real invoice accuracy has not been measured.

## Primary-source findings

Microsoft lists PDF, JPEG, PNG, BMP, TIFF, and HEIF for invoice extraction. WebP is absent. HEIC is not named explicitly. Test compatibility or convert a separate extraction copy. Keep the original unchanged.

The same page supports API version `2024-11-30`:
[Invoice model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/invoice?view=doc-intel-4.0.0).

The invoice schema has product code, description, quantity, unit, unit price, and amount. It has no dedicated brand or line-discount field. Do not infer these values from a total difference:
[Invoice schema](https://github.com/Azure-Samples/document-intelligence-code-samples/blob/main/schema/2024-11-30-ga/invoice.md).

Confidence is an estimate. It is not measured accuracy on the shop's documents. Select review thresholds with representative samples:
[Transparency note](https://learn.microsoft.com/legal/cognitive-services/document-intelligence/transparency-note).

The F0 tier has a 4 MB file limit and processes only the first two pages per request. It allows 500 pages per month. The app's current upload limits do not enforce these provider limits:
[Service limits](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0),
[Pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/).

## Recommended boundary

Start in development. Keep the existing screens and posting rules. First make input handling honest about provider limits. Then measure real extraction. Do not claim support for all layouts, handwriting, or arbitrary file types.

Test photos and PDFs from the intended suppliers. Include poor photos, long invoices, missing fields, discounts, and similar product codes. Use documents the shop permits us to process. Keep files, reference answers, and raw results outside Git.

Report failed documents, missing and extra lines, and exact critical-field results. Show normalized comparisons separately. Synthetic samples prove the flow only. They do not prove real invoice accuracy.

## Human decisions

Confirm the development-first scope. Identify permitted samples. Choose Azure access and the allowed cost tier. Set the accuracy target after the first measured baseline. Do not enable production extraction before a release decision.
