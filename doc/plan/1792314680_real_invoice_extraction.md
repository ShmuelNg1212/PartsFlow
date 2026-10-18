# Real invoice extraction in development

Date: 2026-10-18. Mode: technical. Status: approved; executing.
Base: `fec03c3`. Study: [findings](../study/1792314641_real_invoice_extraction.md).
Skills: research and grilling for planning; tdd and Supabase for execution; code-review for rendezvous.

## OPEN QUESTIONS

1. Azure account access is pending. The human requested help with Free F0 on 2026-10-18. Stop if it is not available without paid usage. Do not create a paid resource or upgrade a tier.

Real-shop accuracy has no acceptance target yet. Agree on one when permitted representative invoices are available. This is outside the synthetic test milestone.

## Approved direction and boundaries

The human selected development-first testing and synthetic invoices on 2026-10-18.
The human approved this plan on 2026-10-18. Do not change production configuration or deploy to production.

Read PDFs and photos into an editable draft. Keep the original private and unchanged. Keep the current screen design. Keep manual entry available.
Require product selection, correction, and owner confirmation before stock changes. Do not add automatic posting or external dashboard integration.
Rules: R-DOC-1 through R-DOC-10, R-EXT-1 through R-EXT-4, R-POST-1, and R-PROD-5. Keep ADR 0002 unchanged.

## Task board

- [x] T1. Make extraction input limits explicit. **tests: first**.
  - Identify formats supported by the chosen Azure tier.
  - Test unsupported formats, file size, page limits, and invalid input before code changes.
  - Preserve the original. Convert a separate copy only when needed and verified.
  - If conversion needs a new dependency, check its official docs and stable version first.
  - Give a clear retry or manual-entry path. Do not report a truncated invoice as fully read.
  - Acceptance: unsupported or oversized input cannot silently become a successful complete extraction. Native phone formats have a tested path or a clear message.
  - Complete when adapter and handler regressions pass under R-DOC-1 and R-DOC-9.

- [x] T2. Make the evaluation report useful for business fields. **tests: first**.
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

Execution started on `feat/real-invoice-extraction`. The approved test boundaries are the Azure adapter, extraction handler, evaluation report, and authenticated browser workflow described in T1 through T4.
Untracked Finder `.DS_Store` files were present at execution start. They are not part of this change.

### Local implementation

T1 uses conservative F0 limits of 4,000,000 bytes and two PDF pages. Supported automatic formats are JPEG, PNG, and PDF. Other originals remain usable for manual entry. This avoids adding unverified phone-image conversion.
Added pinned `pdf-lib` 1.17.1 after checking its official API docs and latest release. Its page parser prevents silent F0 truncation. The per-function Deno configuration pins the same version.
Sources: [PDF API](https://pdf-lib.js.org/docs/api/classes/pdfdocument), [release](https://github.com/Hopding/pdf-lib/releases/tag/v1.17.1), [Edge dependencies](https://supabase.com/docs/guides/functions/dependencies).
Tests failed before the format, size, page, empty-input, and multiple-invoice fixes. The positive PDF test verifies the original bytes are sent unchanged.
The review found a MIME spoofing bypass. A new test first reproduced it. Byte-type validation now blocks it before a request. Both review axes found this issue. The Standards follow-up confirmed the fix.
Deno checking also exposed an existing typed-buffer mismatch in hashing. A copied ArrayBuffer keeps the hash input unchanged and passes the Deno check.

T2 reports exact critical values, normalized descriptive text, failed and omitted documents, absent and unspecified fields, and missing and extra lines. Decimal comparison uses strings. Product codes stay exact.

T3 preparation is complete. Six new synthetic cases and reference answers are in `/private/tmp/partsflow-extraction-cases`. The generator does not alter the demo hashes. The page-limit case has three pages. All six files are below 4 MB. Actual Azure calls have not run.
The wizard `/private/tmp/partsflow-azure-setup.sh` guides the human through Azure sign-in, Free F0 creation, and private endpoint/key capture. It passed `bash -n`. Shellcheck is not installed. The wizard was not run by the agent because registration and secret entry need the human.
It writes only ignored `.env.azure.local`, with mode 0600. No Azure settings or production settings were changed.

### Checks so far

- 96 unit tests pass. This includes 22 Azure adapter tests.
- 133 isolated local database tests pass. These are not real Supabase-stack tests.
- TypeScript, lint, build, standalone extraction-script typecheck, and Deno function check pass.
- Authenticated desktop and phone regression tests pass: 10 passed, two layout-specific skips. They use the hosted development demo extractor. They cover upload, review, posting, manual fallback, and receipt/sale stock results. They do not prove the changed Azure adapter works through the hosted function.
- Standards and Spec reviews found the MIME bypass described above. The fix is regression-tested.
- Simplify and security-review skills are not installed. Manual review covered secret handling, byte limits, private originals, and the draft-only boundary. No auth, RLS, posting, or schema rule changed.
- No screen or animation changed. The design review tools do not apply to this local server-and-report change.
- `graphify update .` completed. SQL extraction is still limited by the missing optional `tree_sitter_sql` dependency. No SQL changed in this feature.

### Remaining work

T3 still needs the human's Azure resource. Then configure only development, run the synthetic evaluation, and record measured results.
T4 still needs actual Azure capture-to-post verification. Current browser regressions use the existing demo provider. A real-phone camera check is also pending.
The plan remains open. No rendezvous merge, GitHub push, or production deployment is complete for this feature.
