# Architecture intent

## Stock authority

The ledger is the source of truth. A cached balance makes stock searches fast.
Posting and reversal change the ledger and balance in one database transaction.
Document and product locks serialize concurrent writes. A client key makes posting idempotent.
A reconcile view compares cached balances with the ledger.
Clients can edit drafts. They cannot write ledger rows or change posted documents.
Database functions enforce owner permissions, duplicates, units, and sufficient stock.
A transaction advisory lock serializes posting within each shop so duplicate checks see earlier posts.
The line guard locks the parent before it checks draft status.
RLS restricts each table to the caller's shop and role. Roles come from membership rows.

## Application

React Router provides routes in one Vite application.
TanStack Query owns server state and invalidation.
An account change clears protected caches before the next account renders.
Detail reads require the active shop ID. Shop changes remove the old workspace and return home.
Realtime events invalidate stock and document queries in other sessions.
Decimal strings cross the API boundary. Decimal.js performs local calculations.
The browser shows a posted document only after server confirmation.

The workspace keeps an unsaved copy on the device. It is not an offline queue.
Each edit updates the local copy before a shop change can remove the workspace.
A timestamp check rejects stale saves. The user can reload and restore local edits.
Warm monochrome surfaces keep stock state readable. Semantic badges use muted colors.
The phone layout uses stacked line cards and bottom navigation.
The workspace action bar sits above navigation and its safe area.

## Motion

Motion gives short state feedback only. Staff use the app all day, so most surfaces stay still.
All motion is CSS in `src/index.css`. The app has no motion library.
The curve tokens are `--motion-ease-out` and `--motion-ease-in-out`. Do not name them `--ease-out`: Tailwind utilities read that name.
Entrances use `@starting-style` and play once on mount. Nothing has an exit animation, so the next action never waits.

- `.motion-page`: each new path fades in and rises 4 px (180 ms). The wrapper in `AppShell` is keyed on the path, so filter and search changes do not replay it.
- `.motion-enter`: inline alerts and banners fade in and drop 4 px (200 ms).
- `.motion-enter-x`: steps in the new document dialog slide 6 px (180 ms).
- `.motion-fade`: a line the user adds fades in (150 ms). Lines loaded with the document do not.
- `.motion-progress`: an indeterminate bar while a document is read.

The global reduced-motion rule makes every entrance instant. Under reduced motion, the progress bar fades in and out but does not move.
These surfaces must not animate: pickers, selects, and menus (they open many times per document), skeleton-to-content swaps, the save status text, and lists (no stagger).
`e2e/motion.spec.ts` reads the running transitions. It fails if `@starting-style` stops applying.

## Frontend host

Cloudflare Workers Static Assets serves the compiled Vite files.
Existing assets bypass the Worker handler.
A small handler serves the app for unmatched client routes and keeps missing file responses at 404.
Supabase still owns Auth, data, private files, and extraction.
Production build variables are explicit. The local host runtime loads no backend secrets.

## Extraction and private files

Original uploads use a private Storage bucket and a shop/document path.
Members open short-lived signed URLs. Clients cannot replace uploaded originals.
The server validates the caller and file hash before extraction.
Provider output stays in raw columns. It does not write stock.
The user confirms the product and physical receipt quantity before posting.
The demo provider recognizes bundled sample hashes only.
The hosted function uses the demo provider. Local PaddleOCR is a development path behind the same interface (ADR 0005).
The local path keeps the hosted trust boundary: the bridge runs the same `handleExtract` checks and the same `apply_extraction` write. The Python worker holds no Supabase credential. It only turns bytes into text lines with boxes.
Field mapping is in TypeScript, so it shares the result types, decimal rules and tests with the rest of extraction. It takes values only from explicit evidence: labels, a header row, and row arithmetic. A value it cannot support stays empty for the owner. This favours fewer automatic values over wrong ones.
Production builds contain no local OCR path. Real-shop accuracy is unknown.

## Demo and measurement

A separate shop marks synthetic data with `is_demo`.
Seeds use the same product import and ledger functions as ordinary owners.
Audit events store document-open time and post-time correction counts.
The owner can export the counts. The app does not infer pilot success from them.
Client-reported suggestion IDs support measurement only. They grant no stock authority.

## Test boundary

Local PostgreSQL tests cover transactions, concurrency, permissions, and stock rules.
A minimal Auth and Storage shim makes these tests repeatable without Docker.
Hosted browser tests cover Auth, PostgREST, Storage, Realtime, and Edge Functions.
The shim is not proof of all hosted behavior. See [setup](setup.md) for remaining checks.
