# 0003. Pilot scope and system-of-record boundary

Date: 2026-10-18. Status: accepted. Source: [product brief](../canonical/product_brief.md), "Target users and scope" and "Pilot boundaries".

## Context

The demand is an early hypothesis from six interviews. Shops may already use other software for sales or accounting.

## Decision

- One shop, one stock location, two roles (owner, staff), online only.
- PartsFlow records documents the shop already has. It does not issue invoices and makes no tax-compliance claim.
- PartsFlow is the system of record for its own stock ledger only. It does not sync with other software, and the UI does not imply that it does.
- Inside PartsFlow, one physical movement is recorded once: idempotent posting and duplicate detection enforce this.
- Out of scope: accounting, payroll, supplier purchasing, ecommerce, chatbot support, vehicle compatibility inference, multiple branches.

## Consequences

- A request for an out-of-scope feature goes to the human as an OPEN QUESTION, not into a plan.
- Pilot results describe what was measured, and nothing more.
