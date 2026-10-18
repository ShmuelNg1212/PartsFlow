# PartsFlow spec

Source of intent: [doc/canonical/product_brief.md](../canonical/product_brief.md). Terms: [GLOSSARY.md](../../GLOSSARY.md).

**Status (2026-10-18):** The pilot application is implemented locally. See "Implementation status" for checks and remaining limits. Changes to intent go to a plan's OPEN QUESTIONS first, then an ADR.

## Purpose

PartsFlow is a pilot single-page web app for small, owner-operated auto supply shops. It reduces repeated manual entry of invoice and stock data. Stock records must stay accurate.

The demand is a hypothesis. Six interviews found it: two reported invoice and stock entry pain, and one reported slow stock lookup. Do not describe it as proven demand.

## Scope

- One shop. One stock location.
- Configurable currency. Configurable shop timezone.
- Online use only. The app does not work offline.

### Out of scope

Do not build these: accounting, payroll, supplier purchasing, ecommerce, chatbot support, vehicle compatibility inference, multiple branches, multiple stock locations.

### System-of-record boundary

- PartsFlow records existing documents. It does not issue invoices. Do not claim tax compliance.
- PartsFlow does not update the shop's other software. Do not imply that it does.
- The same physical movement must not be recorded twice in PartsFlow (see R-POST-6).

## Roles

| Action | Staff | Owner |
|---|---|---|
| Search stock, view history | yes | yes |
| Create and edit drafts, upload documents | yes | yes |
| Confirm (post) a document | no | yes |
| Reverse a posted document | no | yes |
| Create, edit, and import products | no | yes |
| Override a duplicate warning | no | yes |
| Change settings | no | yes |

- **R-ROLE-1** The backend enforces every permission. Hiding a button is not enforcement.
- **R-ROLE-2** Owners invite members. There is no public sign-up.

## Screens

One application shell. Client-side routes. Browser back, refresh, and direct links work on every route.

1. **Overview**: documents that wait for review, low-stock products, recent posted documents. Sales totals have the label "Recorded sales". Do not label them as cash received or profit. No decorative charts.
2. **Invoice inbox**: the document list and the invoice workspace (main feature).
   - Desktop: the original document is beside an editable line-item table.
   - Phone: a stacked review flow, and camera or file capture.
3. **Inventory**: product list, search, product create and edit, CSV import.
4. **Stock history**: the ledger, filtered by product. Each movement links to its source document.
5. **Settings**: shop name, currency, timezone, members. Minimal.

### UI rules

- Readable type, clear labels, visible keyboard focus, large touch targets, keyboard-friendly entry, restrained color.
- Each data view has loading, empty, error, retry, and success states.
- Every visible action works. Do not show a control for a feature that does not exist.
- Show connection failures clearly. Keep unsaved work where practical.
- **R-UI-1** Do not show a document as posted before the server confirms the post.

## Workflows

### 1. Inventory setup

- **R-PROD-1** A product has: SKU, manufacturer part number, description, brand, base unit, selling price, reorder threshold. Shelf/bin is optional.
- **R-PROD-2** CSV import shows a preview with validation errors per row before it writes data.
- **R-PROD-3** Opening quantities are stock movements with source `opening`. They are not a direct balance edit.
- **R-PROD-4** Search matches SKU, part number, description, brand, and confirmed supplier aliases.
- **R-PROD-5** Different brands are different products. Similar part numbers are different products. Never merge or substitute them automatically.

### 2. Capture and review

- **R-DOC-1** Accepted uploads: supported image types and PDF. The original file goes to private storage and does not change.
- **R-DOC-2** The user selects the direction before review: "Receive stock" or "Record a sale".
- **R-DOC-3** Extraction targets: document number, date, counterparty, and per line: description, part number, quantity, unit, price, discount. Also totals, when present.
- **R-DOC-4** Raw extracted values are stored apart from corrected values. A correction never overwrites the raw value.
- **R-DOC-5** The UI marks uncertain and missing fields.
- **R-DOC-6** The app suggests product matches. An ambiguous match needs the user to select a product before the line can post.
- **R-DOC-7** The user can deliberately create a new product from a line.
- **R-DOC-8** A confirmed match saves a supplier alias (counterparty + supplier description → product) for later suggestions.
- **R-DOC-9** Manual entry and correction work when extraction fails or is not available.
- **R-DOC-10** Users can save a draft and open it again later.

### 3. Posting

- **R-POST-1** Drafts and extraction results never change stock.
- **R-POST-2** Before posting, the app shows a summary of each stock increase and decrease.
- **R-POST-3** For a receipt, the user confirms the quantity physically received per line. The invoice quantity is not proof of delivery.
- **R-POST-4** For a sale, the posted quantity is goods released from stock.
- **R-POST-5** The document status change and all its stock movements commit in one database transaction, or nothing commits.
- **R-POST-6** Posting is idempotent. Repeat clicks, retries, and concurrent submissions post a document once only.
- **R-POST-7** Concurrent sales cannot make a balance negative.
- **R-POST-8** A sale with insufficient stock is blocked. The message names the product, the quantity on hand, and the quantity requested.
- **R-POST-9** Likely duplicates are found by document number + counterparty + direction and by file hash. A duplicate needs review. Only an owner can override, with a reason.
- **R-POST-10** A posted document does not change. To correct it, an owner reverses the whole document with a reason. The reversal makes compensating movements linked to the original. A reversal that would make a balance negative is blocked.
- **R-POST-11** When the invoice unit differs from the product's base unit, the user enters an explicit conversion factor. The app never guesses a conversion.

### 4. Stock lookup

- **R-STOCK-1** A product shows current quantity, base unit, shelf/bin, and low-stock state (quantity at or below reorder threshold).
- **R-STOCK-2** From a product, the user opens its movement history and the source documents.
- **R-STOCK-3** Posted changes show in other open sessions without a full-page refresh.

### 5. Daily activity

- **R-ACT-1** CSV export of products, movements, and documents (basic).

## Data and integrity

Tables: shops, memberships, products, counterparties, supplier aliases, documents, document lines, stock movements, audit events.

- **R-DATA-1** Each stock movement has: source (document line, opening, or reversal), signed quantity in base units, timestamp, actor, and reason where applicable.
- **R-DATA-2** The ledger is the source of truth for balances. A stored balance is allowed only if it updates in the same transaction and can be reconciled against the ledger.
- **R-DATA-3** Money and quantities use database `numeric` types and decimal-safe arithmetic in code. No floating point.
- **R-DATA-4** The backend enforces status transitions, permissions, idempotency, quantity validation, and stock rules. Browser validation is a convenience only.
- **R-DATA-5** Row-level security is on for every table. Storage buckets are private.
- **R-DATA-6** Server secrets never go to the frontend.
- **R-DATA-7** Clients cannot write stock movements or set a document to posted directly. Only the posting function can.
- **R-DATA-8** Posts, reversals, overrides, and product changes write audit events.

## Extraction

- **R-EXT-1** Extraction is behind a replaceable interface.
- **R-EXT-2** First provider to evaluate: Azure AI Document Intelligence, against representative invoices.
- **R-EXT-3** Extraction output is an untrusted draft. It never posts stock.
- **R-EXT-4** Without credentials, a demo extractor runs on synthetic sample documents only. Its label says "Demo". Do not present it as real OCR.

## Data separation

- **R-DEMO-1** Synthetic demo products and sample invoices stay separate from live shop data.

## Required checks

Each check must be an automated test (Vitest or Playwright) that can fail.

| Check | Rules |
|---|---|
| Drafts leave stock unchanged | R-POST-1 |
| Receive 5 units: stock increases by exactly 5 | R-POST-3, R-POST-5 |
| Sell 2 units: stock decreases by exactly 2 | R-POST-4, R-POST-5 |
| Repost or retry does not change stock again | R-POST-6 |
| Concurrent sales cannot oversell | R-POST-7 |
| Reversal restores the expected balance | R-POST-10 |
| Ambiguous product matches need review | R-DOC-6 |
| Unauthorised users cannot post movements or read private files | R-ROLE-1, R-DATA-5, R-DATA-7 |
| Capture or manual entry → review → confirm → stock lookup works on desktop and phone layouts | Workflows 2–4 |

## Decisions beyond the brief

The brief did not settle these. The human confirmed them on 2026-10-18 ([ADR 0004](../adr/0004-confirmed-pilot-rule-details.md)). They are rules, the same as the rules above.

- D1. Only owners override a duplicate warning (R-POST-9) and change settings.
- D2. The duplicate key is document number + counterparty + direction, plus the file hash (R-POST-9).
- D3. Low stock means balance at or below the reorder threshold (R-STOCK-1).
- D4. A reversal reverses a whole document, not single lines. To correct one line, reverse the document and post a corrected one (R-POST-10).
- D5. A reversal that would make a balance negative is blocked, the same as R-POST-8 (R-POST-10).
- D6. Owners invite members. There is no public sign-up (R-ROLE-2).

## Pilot evaluation

Measure: invoice completion time, corrections required, product-matching errors, and whether users finish without help. Record only measured results. Never fabricate validation outcomes.

## Implementation status

The application has sign-in, owner and staff roles, shop selection, Overview, Invoices, Inventory, History, and Settings.
Manual receipt and sale entry, save and restore, post, duplicate review, reversal, CSV import and export, private uploads, and extraction review are implemented.
Database tests cover the stock rules, RLS, concurrent posting, concurrent sales, raw extraction separation, and measurement events.
Hosted browser tests cover the manual flow on desktop and phone, upload and demo extraction, signed file access, and Realtime refresh.
The design uses Geist, Geist Mono, Newsreader titles, Phosphor icons, and muted state colors.
Phone layouts include stacked line cards, large controls, and safe-area spacing.
Line discounts can be entered and corrected on both layouts.
Account changes clear cached data. Detail reads use the active shop.
Concurrent duplicate copies need an override. Line edits serialize with posting.

The separate demo shop has synthetic products and three sample invoices.
The demo extractor reads only those sample hashes. It is labelled.
The Azure adapter and evaluation script exist. Azure evaluation is not done.
Owner exports include raw pilot measurements. No real-shop pilot result has been measured.

Remaining limits:
- Real invitation email delivery needs hosted Auth URLs, SMTP, and allowed app origins.
- Hosted public sign-up must be disabled in the dashboard. Local configuration does not prove this setting.
- The full database suite uses local PostgreSQL and an Auth/Storage shim. It has not run on an isolated real Supabase stack.
- Real-phone keyboard, safe-area, and touch checks are not done.
- No production host is selected. No production release is verified.

See [setup](setup.md), [architecture intent](architecture.md), and [owner testing guide](owner_testing_guide.md).
The [pilot plan](../plan/1792301569_pilot_app.md) records the final check results.
