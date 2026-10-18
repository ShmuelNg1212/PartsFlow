# 0001. Stock ledger and a single posting path

Date: 2026-10-18. Status: accepted. Source: [product brief](../canonical/product_brief.md), "Confirm stock changes" and "Data and integrity".

## Context

Accurate stock is the pilot's main promise. Retries, double clicks, two open tabs, and two staff on one product are normal in a small shop. A browser check cannot stop these.

## Decision

- The stock movement ledger is the source of truth. A stored balance is a cache that updates in the same transaction and reconciles against the ledger.
- One database function posts a document. It checks the role, the status transition, the idempotency key, the duplicate state, and the balances. It locks the affected product rows, writes the movements, and sets the status, in one transaction.
- Reversal is a second database function with the same guarantees. It writes compensating movements linked to the original. Nothing edits or deletes a posted document or a movement.
- Row-level security denies direct client inserts and updates on stock movements and on the posted status.

## Consequences

- Stock rules are tested at the database level, not only in the UI.
- A wrong post is corrected by reversal plus a new post. History keeps both.
- Negative balances cannot occur from posts or reversals.
