# 0004. Confirmed pilot rule details

Date: 2026-10-18. Status: accepted. Confirmed by the human. Source: [spec.md](../wiki/spec.md), "Decisions beyond the brief".

## Context

The [product brief](../canonical/product_brief.md) left six details open. The spec listed them as assumptions A1–A6. The human confirmed all six.

## Decision

1. Only owners override a duplicate warning and change settings.
2. The duplicate key is document number + counterparty + direction, plus the file hash.
3. Low stock means balance at or below the reorder threshold.
4. A reversal reverses a whole document. Line-level reversal is not in the pilot.
5. A reversal that would make a balance negative is blocked.
6. Owners invite members. There is no public sign-up.

## Consequences

- To correct one line, the owner reverses the document and posts a corrected one.
- A reversal of a receipt can fail when its stock is already sold. The message must say why, the same as R-POST-8.
- The same document number from one counterparty is allowed once per direction.
