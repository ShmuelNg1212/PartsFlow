# Direct line writes can conflict with draft saves

A line write must lock its parent document before it can check draft status.
This prevents edits while the parent posts.
A direct API update can lock the line before its trigger locks the parent.
The save RPC locks the parent first. Concurrent direct writes can therefore cause a PostgreSQL deadlock (`40P01`).
The database cancels one transaction. It does not commit partial stock changes.
The app uses `save_draft` for line edits, so normal app saves use the same lock order.
Use that RPC for integrations. Retry a cancelled transaction after reading the current document status.
