# Real invoice extraction in development

Date: 2026-10-18. Mode: technical. Status: awaiting approval.
Base: `fec03c3`. Study: [findings](../study/1792314641_real_invoice_extraction.md).
Skills: research and grilling for planning; tdd and Supabase for execution; code-review for rendezvous.

## OPEN QUESTIONS

1. Approve this plan to test Azure on synthetic invoices in development?
2. Is an Azure Document Intelligence resource available? If not, approve an F0 resource only. Stop if it is not available without paid usage. Do not create a paid resource or upgrade a tier.

Real-shop accuracy has no acceptance target yet. Agree on one when permitted representative invoices are available. This is outside the synthetic test milestone.

## Approved direction and boundaries

The human selected development-first testing and synthetic invoices on 2026-10-18.
Plan approval is still pending. Do not change production configuration or deploy to production.

Read PDFs and photos into an editable draft. Keep the original private and unchanged. Keep the current screen design. Keep manual entry available.
Require product selection, correction, and owner confirmation before stock changes. Do not add automatic posting or external dashboard integration.
Rules: R-DOC-1 through R-DOC-10, R-EXT-1 through R-EXT-4, R-POST-1, and R-PROD-5. Keep ADR 0002 unchanged.

## Task board

- [ ] T1. Make extraction input limits explicit. **tests: first**.
  - Identify formats supported by the chosen Azure tier.
  - Test unsupported formats, file size, page limits, and invalid input before code changes.
  - Preserve the original. Convert a separate copy only when needed and verified.
  - If conversion needs a new dependency, check its official docs and stable version first.
  - Give a clear retry or manual-entry path. Do not report a truncated invoice as fully read.
  - Acceptance: unsupported or oversized input cannot silently become a successful complete extraction. Native phone formats have a tested path or a clear message.
  - Complete when adapter and handler regressions pass under R-DOC-1 and R-DOC-9.

- [ ] T2. Make the evaluation report useful for business fields. **tests: first**.
  - Test omitted documents, extra and missing lines, similar codes, decimal values, and absent fields.
  - Report document failures separately from successful field matches.
  - Report exact critical values separately from normalized text comparisons.
  - Cover direction-appropriate counterparties, units, prices, quantities, line amounts, and totals. State brand and discount limits explicitly.
  - Do not infer a brand, discount, product match, or unit conversion from incomplete evidence.
  - Acceptance: the report cannot hide failed reads or present punctuation-normalized part codes as exact matches.
  - Complete when scorer tests pass and the report records its sample count and limitations.

- [ ] T3. Configure Azure for the development backend and run synthetic extraction. **tests: alongside**.
  - Obtain the endpoint and key through a private local mechanism. Never commit or print them.
  - Use a human-only setup guide if account access requires the human.
  - Configure only the development extraction function. Use no production shop or account.
  - Create labelled synthetic invoices with known reference values. Include PDFs and phone-style photos, multiple lines, missing fields, discounts, and a poor image.
  - Use new documents that are not recognized by the canned demo extractor.
  - Run actual Azure extraction and record measured values and failures.
  - Acceptance: the server identifies Azure as the provider. The browser shows the original and editable extracted values. Keys remain server-side.
  - Complete when the synthetic evaluation report is saved and clearly states that real-shop accuracy is unknown.

- [ ] T4. Verify capture through dashboard update. **tests: alongside**.
  - Run one Playwright process at a time. Test desktop upload and phone layout capture/review.
  - Review and correct extracted lines. Select products deliberately. Confirm physically received quantities.
  - Prove the draft leaves stock unchanged. Post once. Verify the expected stock and dashboard activity. Retry and prove no second movement.
  - Exercise unsupported input and a failed read through the browser.
  - Check a real phone camera when a device is available. Do not substitute a file-picker test for this check.
  - Acceptance: measured synthetic values reach the correct development shop after review and posting. Failed reads leave a usable draft.
  - Complete when browser evidence and test results are recorded with remaining device limits.

## Rendezvous and documentation

Run `npm test`, `npm run test:db`, relevant Playwright workflows, typecheck, lint, and build after code changes.
Run the mattpocock code-review skill. Use simplify and security-review if installed and applicable. Keep any missing review tool explicit.
If screen controls change, apply minimalist-ui and mobile-native. Run break-ui and review-animations on those changes.
Run `graphify update .` after code changes.
Verify the first user action through the authenticated development upload flow. A sign-in page check is not enough.
Record findings and routine tactical choices here. Sync setup, spec implementation status, and the owner testing guide. Do not change product intent.
Keep finished work on its branch until approved to ship. No GitHub push or production release is included in this plan.

## Completion criterion

An owner can upload a synthetic PDF or photo in development, obtain an actual Azure-prefilled draft, correct it, post it once, and see the expected dashboard and stock changes. Measured extraction results and limits are recorded. No real-shop accuracy claim or production change is made.

## Execution record

Not started. No application code or hosted settings changed during planning.
