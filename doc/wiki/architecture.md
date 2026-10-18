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
The current source function uses the demo provider. A local PaddleOCR adapter is planned behind the same interface. Actual OCR accuracy is unknown.

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
