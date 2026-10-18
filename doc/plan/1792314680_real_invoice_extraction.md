# Local PaddleOCR invoice extraction

Date: 2026-10-18. Mode: technical. Status: approved 2026-10-18; executing.
Feature branch: `feat/local-paddleocr`, based on the provider-cleanup branch.
Study: [local PaddleOCR](../study/1792316603_local_paddleocr.md).
Skills: research, codebase-design, and grilling for planning; tdd and Supabase for execution; code-review for rendezvous.

## OPEN QUESTIONS

1. ~~Approve this revised plan for local PaddleOCR on the Mac, with synthetic invoices only?~~ Approved by the human on 2026-10-18. The human did not choose a Python version. The agent used the recommended isolated Python 3.11 environment.

This plan adds a Python worker and a local authenticated bridge. It is larger than changing an extractor setting.
No cloud OCR account, cloud LLM, paid resource, public tunnel, GitHub push, or production deployment is included.

## Human direction

The human approved development-first extraction testing with synthetic invoices. The human selected PaddleOCR on 2026-10-18.
The earlier hosted-provider plan was approved and partially implemented. This revised architecture still needs approval under the project size gate.

## Architecture decision proposed for approval

Use PP-StructureV3 on CPU in an isolated Python 3.11 environment. Start with PaddleOCR 3.7.0 and PaddlePaddle 3.3.1. Lock the compatible dependency set after the smoke test.
Read text and tables. Map explicit labels and table columns into the existing Extractor result. Keep missing or ambiguous values unresolved. Keep all numbers as decimal strings.

The Python worker has no Supabase credentials. A local authenticated bridge reuses the current extraction access checks and privileged RPC. It downloads the private original from the development project and calls the worker.
Both processes bind to loopback. A Vite development proxy connects the local app to the bridge. The production build keeps the hosted extraction path.
Use only the development project `urljzpqigvtoooitwjrd`. Startup must reject production configuration. Capture any needed development server credential in an ignored file. Never expose it to the browser or logs.

Preserve ADR 0002 and R-DOC-1 through R-DOC-10, R-EXT-1, R-EXT-3, R-EXT-4, R-POST-1, and R-PROD-5.
Extraction never posts stock, confirms a product match, or guesses a unit conversion. Owners still review and confirm.

## Completed foundation

- [x] T1. Remove the retired hosted adapter, its provider-specific tests, fixture, runner, PDF dependency, and setup. **tests: first** for provider-neutral report labels. This cleanup was separately authorized on 2026-10-18.
- [x] T2. Complete evaluation scoring and synthetic case generation. **tests: first** for scoring; **tests: alongside** for generated documents. Reuse this work. The report now uses the provider in the recorded results.

Six new cases and reference answers are in `/private/tmp/partsflow-extraction-cases`. The generator can recreate them. It does not alter canned demo hashes.
No actual hosted OCR call ran. Its setup wizard and provider-specific study were deleted at the human's request.

## Active task board

- [x] P1. Prove local PaddleOCR inference. **tests: alongside**.
  - Create an isolated Python 3.11 environment. Verify and pin official compatible dependencies. Commit the lockfile. Keep the environment and model cache out of Git.
  - Disable unused formula, seal, and chart modules. Run the Paddle runtime check.
  - Run actual StructureV3 inference on a newly generated invoice. Save raw output outside Git.
  - Measure startup time, page time, downloaded model sizes, and peak memory where available.
  - Acceptance: the Mac returns real text and table output. Record exact versions and commands. Do not substitute a fixture or a canned result.
  - Complete when the smoke-test evidence is recorded. If the runtime fails, stop and report it before building the bridge. Do not silently add another model or hosted provider.

- [x] P2. Map invoice fields and measure the supported layouts. **tests: first**.
  - Test through the worker's public extraction interface. Cover headers, receipt suppliers, sale customers, line items, units, discounts, totals, and exact part codes.
  - Map fields only from explicit evidence. Treat OCR text and table HTML as data. Preserve raw output separately.
  - Handle missing columns, unknown layouts, multiple invoices, corrupt files, and incomplete page results. Do not report a partial document as fully read.
  - Test decimal precision. Keep brand identity and similar part codes distinct. Do not infer product matches.
  - Reuse the provider-neutral report. Add a local runner for the actual worker results. Verify all-document failure denominators.
  - Run all six synthetic cases with actual OCR. Report exact fields, failures, missing and extra lines, and manual correction needs.
  - Acceptance: field values have source evidence. Unknown fields remain null or clearly unresolved. The report states the supported synthetic layouts and limits.
  - Complete when the mapper tests pass and a measured PaddleOCR report is saved. Real-shop accuracy remains unknown.

- [x] P3. Connect the local app through an authenticated bridge. **tests: first**.
  - Done: loopback worker `ocr/worker.py` with internal bearer token, byte limit before reading, MIME check, one read at a time (503 while busy), page-complete reads, and `/health`. 10 pytest tests. Limits: 10 MB and 5 pages; client timeout 120 s, from P1 timings (21.9 s for 3 pages).
  - Reuse the existing extraction handler and Extractor interface. Keep privileged writes server-side.
  - Test the bridge request interface for expired sessions, another shop, non-drafts, invalid file paths, production configuration, and unavailable OCR.
  - Bind the bridge and worker to loopback. Require a private internal credential for bridge-to-worker requests. Restrict browser origins.
  - Set byte, page, concurrency, and timeout limits from P1 measurements. Record the choices here. Preserve the complete original. Reject excessive input before inference.
  - Add health/readiness checks and safe failure messages. A cold or failed model must leave manual entry available.
  - Use a development-only proxy and opt-in setting. A production build must not call the local scanner or contain a privileged key.
  - Acceptance: an authenticated local user can upload a synthetic document and receive a PaddleOCR draft through the current workspace.
  - Complete when bridge access tests pass and the development app shows the correct provider with server-side raw persistence.

- [x] P4. Verify the complete document flow. **tests: alongside**.
  - Run one Playwright process at a time. Exercise local OCR through actual authenticated development uploads on desktop and phone layouts.
  - Upload a generated PDF and a photo. Compare the fields to the originals. Correct the lines, choose products, and confirm received quantities.
  - Save and reopen the draft. Prove stock stays unchanged until posting.
  - Post once. Check Inventory, Overview, and stock history. Retry and prove no second movement.
  - Test unsupported input, a poor image, a multi-page document, and a stopped worker. Keep a usable manual-entry path.
  - Check a real phone camera if a device is available. Record a device limit explicitly if it is not.
  - Acceptance: actual local OCR supplies reviewable values. The expected stock and dashboard changes follow owner confirmation only.
  - Complete when measured browser evidence and correction results are recorded. Mocked provider output cannot satisfy this task.

- [ ] P5. Record the provider choice and operating limits. **tests: alongside**.
  - Use ADR 0005 and R-EXT-2 for the approved provider choice. Update implementation status after the local reader is verified.
  - Sync setup, architecture intent, and owner testing instructions. Include install, start, stop, model downloads, and troubleshooting.
  - State that OCR runs locally while the development app still uses hosted Supabase. The Mac must be running for this local scanner.
  - Document measured layouts and unresolved fields. Do not claim general invoice intelligence or real-shop accuracy.
  - Acceptance: another session can start and verify the same local flow from the docs.
  - Complete when the commands are verified and the docs match the implementation.

## Tactical decisions during execution

- D1. The worker uses the PaddleOCR text pipeline, not PP-StructureV3. The mapper needs only text lines and their boxes. StructureV3 table HTML shifted columns in the smoke test. The text pipeline is about two times faster. Formula, seal, chart, table and layout models are not loaded.
- D2. Invoice-field mapping is in TypeScript behind the existing Extractor interface. The Python worker returns text lines with boxes only. This reuses the decimal rules, the result types, scoring and Vitest. The study proposed mapping inside the worker; this choice is reversible.
- D3. Models are pinned by name: PP-OCRv6_medium_det, PP-OCRv6_medium_rec, PP-LCNet_x1_0_doc_ori and PP-LCNet_x1_0_textline_ori.
- D4. The supplier is read only from an explicit label ("Supplier:", "Vendor:", "Seller:", "Sold by:"). A first version guessed the heading above the labels. On the held-out samples it chose a disclaimer line. A heading is not evidence, so the guess was removed.
- D5. A text fragment that crosses one column boundary ("20 pc", "Qty Unit") is split by word. Each word goes to the column under its estimated centre. A fragment that crosses two or more boundaries ends the table.
- D6. A row whose quantity times unit price, less discount, does not equal its amount loses all four numbers. The description, part number and unit stay. A row that cannot be checked keeps its numbers with confidence at most 0.5.
- D7. A page where more than 25% of text lines score below 0.8 gives no table lines. Labelled header values with a score of 0.9 or more are still used.
- D8. Only ISO dates (YYYY-MM-DD) are read. Day/month order is ambiguous in other formats.

## P1 evidence

Environment: `ocr/` with `pyproject.toml` and `uv.lock`. Python 3.11.17 (Homebrew), PaddlePaddle 3.3.1, PaddleOCR 3.7.0 with the doc-parser extra, PaddleX 3.7.2. Command: `cd ocr && uv sync`. The virtual environment is ignored by Git.
Model cache: `PADDLE_PDX_CACHE_HOME=/private/tmp/partsflow-paddlex-cache`. The four pinned models use 146 MB on disk.
`paddle.utils.run_check()` passed on CPU.
Measured on this Mac, CPU only, actual inference on the six synthetic cases:

| Case | Pages | Text lines | Seconds |
|---|---|---|---|
| readable-pdf | 1 | 33 | 9.5 |
| phone-photo | 1 | 26 | 6.9 |
| missing-fields | 1 | 20 | 7.3 |
| discounts | 1 | 42 | 10.8 |
| poor-rotated-photo | 1 | 33 | 6.9 |
| three-page-pdf | 3 | 46 | 21.5 |

Pipeline load with two model downloads: 68.4 s. Load from cache with `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True`: 2.5 s. Peak resident memory for the measuring process: about 4.8 GB.
Every page of every case returned a result. The readable, discount, three-page and phone-photo text lines are clean. The phone photo is skewed, so rows must be deskewed before grouping. The poor rotated photo is mostly unreadable text in reversed order.
Raw output is in `/private/tmp/partsflow-paddle-p1`, outside Git.

## P2 evidence

Mapper: `supabase/functions/_shared/extraction/paddle.ts` (`localPaddleExtractor`, `workerReader`). Tests: `paddle.test.ts`, 27 tests. The fixtures are actual PaddleOCR output for the six generated cases and the three bundled demo samples.
The tests were written before the mapper. The first run failed on the missing module. Later fixes followed failing tests: currency label case, wrapped descriptions, merged cells, colon-less totals, and spaced part codes.
Measured report: [synthetic evaluation](../study/1792320512_paddleocr_synthetic_eval.md). Runner: `node scripts/eval-local-ocr.ts` against the running worker.
Generated cases: 6 of 6 read; 8 of 10 lines. Both missing lines are from the poor rotated photo, which gives no lines by design. Every present field on the other five cases matches, except the unlabelled supplier.
Demo samples: 3 of 3 read; 12 of 12 lines. Part number, quantity, unit, unit price, amount, total, number, date and currency match 100%. Descriptions match 10 of 12; the two misses are OCR character errors.
The demo samples were held out for the first run, which found no lines. The mapper was fixed after that run. They are not an independent test now.
Limits: one table per page with a "Description" header; labelled header values in English; ISO dates only; no supplier without a label; no rotated or poor photos. Real-shop accuracy is unknown.

## P3 evidence

Bridge: `scripts/ocr-bridge.ts` with logic in `scripts/ocr-bridge-lib.ts`. It calls `handleExtract` unchanged. Tests: `test/unit/ocr-bridge.test.ts`, 18 tests, written before the code.
- D9. No Supabase secret key is used. `.env.local` has none. Sessions are checked by Supabase Auth with the publishable key. Storage downloads run with the user's own token, so storage policies apply. Document, membership and `apply_extraction` calls use the existing development `SUPABASE_DB_URL`.
- Startup refuses any project ref, Supabase URL or database URL other than `urljzpqigvtoooitwjrd`. It refuses a worker token under 32 characters and a non-loopback worker URL.
- The bridge binds to 127.0.0.1:8766. It accepts browser origins `http://localhost:5173` and `http://127.0.0.1:5173` only. Request bodies above 1 KB are refused.
- The frontend uses the bridge only when `import.meta.env.DEV` and `VITE_LOCAL_OCR=true`. Vite proxies `/local-ocr` in the dev server only. Production builds with and without `VITE_LOCAL_OCR=true` contain no `local-ocr` text.

## P4 evidence

Spec: `e2e/local-ocr.spec.ts`. It runs only with `LOCAL_OCR_E2E=1` and the worker, bridge and `VITE_LOCAL_OCR=true` dev server running. One Playwright process ran at a time.
Passed on desktop and phone layouts against hosted development, with actual PaddleOCR:
- Generated PDF: provider label `paddleocr-local`; document number, both descriptions, part numbers, quantity and price read. Received quantity stayed empty. Stock stayed 0 after save and reload. Posting gave +3 and +2. A second `post_document` call made no new movement (2 movements). Inventory and stock history show the receipt.
- Phone photo: description, part number and quantity read.
Passed on desktop: poor rotated photo gives document number only and manual entry works; three-page PDF gives exactly one line; with the worker stopped, the draft says the scanner is not running and manual entry works.
Not covered in the browser: an unsupported file type (the file picker filters it; the worker refuses it with 422 in `test_worker.py`). The Overview page was not asserted. No real phone was available, so the real camera was not tested.
Two test-only fixes: the app shows `125.5` for the stored value 125.50, so the test compares the value; the product-picker helper counts unpicked lines, so line 2 is picked first.

## Rendezvous

Run TypeScript unit tests, Python mapper/worker tests, the isolated database suite, relevant Playwright workflows, typecheck, lint, build, and the Deno check where applicable.
Run mattpocock code-review on Standards and Spec. Use simplify and security-review if installed. Record missing tools and manual review coverage.
Review the authenticated bridge and secret handling because it processes private documents.
If screen controls change, apply minimalist-ui and mobile-native, then run break-ui and review-animations. Keep the current visual design otherwise.
Run `graphify update .` after code changes.
Exercise the first user upload through actual PaddleOCR. A health endpoint or demo-provider test is not enough.
Record the checks here. Keep the feature branch separate from production main until the human approves a release. No push is included.
Freeze this plan only after all tasks and required checks finish.

## Completion criterion

On this Mac, an owner uploads a synthetic PDF or photo, receives actual PaddleOCR draft values, corrects them, and posts once. Stock and dashboard results are correct. The measured extraction report and local operating instructions are saved. No production setting changes.

## Previous verification record

Before this revision, 96 unit tests, 133 isolated database tests, and 10 desktop/phone browser regressions passed. Two layout-specific checks were skipped. The browser checks used the hosted demo extractor, not PaddleOCR.
TypeScript, lint, build, standalone extraction-script typecheck, and Deno check passed. The MIME-spoof review finding was fixed and regression-tested.
The code graph was updated. SQL extraction remains limited by the missing optional tree_sitter_sql package. No SQL changed.
Simplify and security-review are not installed. Earlier manual review covered private originals, secret handling, limits, and draft-only output.

## Execution record

The local application integration has not started. No Python packages or models were installed during study. The human then installed the runtime and requested setup verification. See the smoke result below. No hosted settings changed.
Untracked Finder `.DS_Store` files remain outside this change.

### Authorized provider cleanup

On 2026-10-18, the human requested deletion of the retired provider's implementation and references. This is one cleanup commit. It does not approve P1 through P5.
Removed its adapter, fixture, provider-specific tests, network evaluation runner, PDF dependency, Deno dependency configuration, setup wizard, and provider-specific study.
Removed its references in current files, including prior records, at the human's explicit request. ADR 0005 records the current choice. Git history was not rewritten.
Kept generic scoring and synthetic cases. Reports name the actual recorded provider. The multi-page synthetic case now tests complete reading without a provider-specific page cap.
The source extraction function uses only the labelled demo provider. No hosted function or production setting changed.
Verification passed: 74 unit tests and six authenticated browser workflow tests. Two layout-specific browser checks were skipped. TypeScript, lint, build, and the Deno function check passed. The report-provider regression failed before the fix and passed after it.
A scan found no retired-provider references in tracked working files. The old local setup files and task-created implementation worktrees were removed. The code graph was updated.
Standards review found no remaining rule violation. The explicit removal request authorizes the targeted changes to earlier records. Spec review confirmed removal of the provider, its setup, dependencies, and stale limits while retaining manual entry and generic evaluation. Simplify and security-review are not installed. Manual review confirmed that access checks and draft-only writes are unchanged.
The cleanup stays on its feature branch because earlier local extraction work has not been approved to ship. No main merge, push, or deployment was made.
The local PaddleOCR plan remains awaiting approval.

### User-installed runtime verification

The human installed PaddleOCR, PaddlePaddle, and the required PaddleX OCR extras in Anaconda. Verification used `/opt/anaconda3/bin/python`, Python 3.13.5. Installed versions are PaddleOCR 3.7.0, PaddlePaddle 3.3.1, and PaddleX 3.7.2.
The default Homebrew Python is a different environment. Do not use it for this installation.
The Paddle CPU runtime check passed. The first pipeline attempt identified missing OCR extras. After the human installed them, actual PP-StructureV3 inference succeeded.
Optional formula, seal, and chart recognition were disabled. Document unwarping was disabled. CPU inference was used.
Models are cached in `/private/tmp/partsflow-paddlex-cache`. Output and a measured smoke summary are in `/private/tmp/partsflow-paddle-smoke`.
The clean synthetic input was `readable-invoice.pdf`. The pipeline returned one page. Initial load with downloads took 99.8 seconds. Prediction and result saving took 20.5 seconds.
Recognized text includes `SYN-EVAL-101`, both reference part codes, the line quantities and prices, and total `1116.64`.
The generated table omitted unit cells and shifted numeric columns. Do not map columns by position without validation. P2 must use source evidence and reject an ambiguous row.
This proves local inference on one clean synthetic PDF only. It does not establish field accuracy across the six cases or real shop invoices.
P1 remains open: an isolated, locked runtime and broader measurements are still required for the application integration. P2 through P5 remain unimplemented.
