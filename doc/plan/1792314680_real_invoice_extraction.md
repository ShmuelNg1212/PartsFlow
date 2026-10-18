# Local PaddleOCR invoice extraction

Date: 2026-10-18. Mode: technical. Status: revised; awaiting approval.
Feature branch: `feat/real-invoice-extraction`. Current code base: `e46b376`.
Study: [local PaddleOCR](../study/1792316603_local_paddleocr.md).
Earlier study: [extraction readiness](../study/1792314641_real_invoice_extraction.md).
Skills: research, codebase-design, and grilling for planning; tdd and Supabase for execution; code-review for rendezvous.

## OPEN QUESTIONS

1. Approve this revised plan for local PaddleOCR on the Mac, with synthetic invoices only?
2. The approval includes a PaddleOCR-first evaluation in place of Azure-first R-EXT-2. Record this choice in an ADR. Keep the canonical product brief unchanged.

This plan adds a Python worker and a local authenticated bridge. It is larger than changing an extractor setting.
No Azure account, cloud LLM, paid resource, public tunnel, GitHub push, or production deployment is included.

## Human direction

The human approved development-first extraction testing with synthetic invoices. The human selected PaddleOCR on 2026-10-18.
The earlier Azure plan was approved and partially implemented. This revised architecture still needs approval under the project size gate.

## Architecture decision proposed for approval

Use PP-StructureV3 on CPU in an isolated Python 3.11 environment. Start with PaddleOCR 3.7.0 and PaddlePaddle 3.3.1. Lock the compatible dependency set after the smoke test.
Read text and tables. Map explicit labels and table columns into the existing Extractor result. Keep missing or ambiguous values unresolved. Keep all numbers as decimal strings.

The Python worker has no Supabase credentials. A local authenticated bridge reuses the current extraction access checks and privileged RPC. It downloads the private original from the development project and calls the worker.
Both processes bind to loopback. A Vite development proxy connects the local app to the bridge. The production build keeps the hosted extraction path.
Use only the development project `urljzpqigvtoooitwjrd`. Startup must reject production configuration. Capture any needed development server credential in an ignored file. Never expose it to the browser or logs.

Preserve ADR 0002 and R-DOC-1 through R-DOC-10, R-EXT-1, R-EXT-3, R-EXT-4, R-POST-1, and R-PROD-5.
Extraction never posts stock, confirms a product match, or guesses a unit conversion. Owners still review and confirm.

## Completed foundation

- [x] T1. Azure-specific free-tier input guards. **tests: first**. These stay isolated in the Azure adapter. Do not apply Azure limits to PaddleOCR.
- [x] T2. Complete evaluation scoring and synthetic case generation. **tests: first** for scoring; **tests: alongside** for generated documents. Reuse this work. Update the report provider label before PaddleOCR evaluation.

Six new cases and reference answers are in `/private/tmp/partsflow-extraction-cases`. The generator can recreate them. It does not alter canned demo hashes.
No actual Azure call ran. The unused Azure setup wizard is no longer a prerequisite.

## Active task board

- [ ] P1. Prove local PaddleOCR inference. **tests: alongside**.
  - Create an isolated Python 3.11 environment. Verify and pin official compatible dependencies. Commit the lockfile. Keep the environment and model cache out of Git.
  - Disable unused formula, seal, and chart modules. Run the Paddle runtime check.
  - Run actual StructureV3 inference on a newly generated invoice. Save raw output outside Git.
  - Measure startup time, page time, downloaded model sizes, and peak memory where available.
  - Acceptance: the Mac returns real text and table output. Record exact versions and commands. Do not substitute a fixture or a canned result.
  - Complete when the smoke-test evidence is recorded. If the runtime fails, stop and report it before building the bridge. Do not silently add another model or hosted provider.

- [ ] P2. Map invoice fields and measure the supported layouts. **tests: first**.
  - Test through the worker's public extraction interface. Cover headers, receipt suppliers, sale customers, line items, units, discounts, totals, and exact part codes.
  - Map fields only from explicit evidence. Treat OCR text and table HTML as data. Preserve raw output separately.
  - Handle missing columns, unknown layouts, multiple invoices, corrupt files, and incomplete page results. Do not report a partial document as fully read.
  - Test decimal precision. Keep brand identity and similar part codes distinct. Do not infer product matches.
  - Make evaluation reports provider-neutral. Verify the provider label and all-document failure denominators before code changes.
  - Run all six synthetic cases with actual OCR. Report exact fields, failures, missing and extra lines, and manual correction needs.
  - Acceptance: field values have source evidence. Unknown fields remain null or clearly unresolved. The report states the supported synthetic layouts and limits.
  - Complete when the mapper tests pass and a measured PaddleOCR report is saved. Real-shop accuracy remains unknown.

- [ ] P3. Connect the local app through an authenticated bridge. **tests: first**.
  - Reuse the existing extraction handler and Extractor interface. Keep privileged writes server-side.
  - Test the bridge request interface for expired sessions, another shop, non-drafts, invalid file paths, production configuration, and unavailable OCR.
  - Bind the bridge and worker to loopback. Require a private internal credential for bridge-to-worker requests. Restrict browser origins.
  - Set byte, page, concurrency, and timeout limits from P1 measurements. Record the choices here. Preserve the complete original. Reject excessive input before inference.
  - Add health/readiness checks and safe failure messages. A cold or failed model must leave manual entry available.
  - Use a development-only proxy and opt-in setting. A production build must not call the local scanner or contain a privileged key.
  - Acceptance: an authenticated local user can upload a synthetic document and receive a PaddleOCR draft through the current workspace.
  - Complete when bridge access tests pass and the development app shows the correct provider with server-side raw persistence.

- [ ] P4. Verify the complete document flow. **tests: alongside**.
  - Run one Playwright process at a time. Exercise local OCR through actual authenticated development uploads on desktop and phone layouts.
  - Upload a generated PDF and a photo. Compare the fields to the originals. Correct the lines, choose products, and confirm received quantities.
  - Save and reopen the draft. Prove stock stays unchanged until posting.
  - Post once. Check Inventory, Overview, and stock history. Retry and prove no second movement.
  - Test unsupported input, a poor image, a multi-page document, and a stopped worker. Keep a usable manual-entry path.
  - Check a real phone camera if a device is available. Record a device limit explicitly if it is not.
  - Acceptance: actual local OCR supplies reviewable values. The expected stock and dashboard changes follow owner confirmation only.
  - Complete when measured browser evidence and correction results are recorded. Mocked provider output cannot satisfy this task.

- [ ] P5. Record the provider choice and operating limits. **tests: alongside**.
  - Add an ADR for the approved PaddleOCR-first evaluation. Update R-EXT-2 and implementation status after approval. Keep canonical files unchanged.
  - Sync setup, architecture intent, and owner testing instructions. Include install, start, stop, model downloads, and troubleshooting.
  - State that OCR runs locally while the development app still uses hosted Supabase. The Mac must be running for this local scanner.
  - Document measured layouts and unresolved fields. Do not claim general invoice intelligence or real-shop accuracy.
  - Acceptance: another session can start and verify the same local flow from the docs.
  - Complete when the commands are verified and the docs match the implementation.

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

The revised PaddleOCR work has not started. No Python packages or models were installed during study. No hosted settings changed.
Untracked Finder `.DS_Store` files remain outside this change.
