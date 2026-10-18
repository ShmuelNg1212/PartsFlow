# 0002. Extraction is an untrusted, replaceable draft source

Date: 2026-10-18. Status: accepted. Source: [product brief](../canonical/product_brief.md), "Extraction" and "Capture and review invoices".

## Context

OCR output contains errors. The extraction provider is not chosen yet: Azure AI Document Intelligence is the first candidate. Credentials may not exist during development or demos.

## Decision

- A server-side function calls the extractor behind one interface. The provider can change without changes to review or posting.
- Extraction writes raw values only. Users write corrected values. Posting reads corrected values only.
- Extraction never posts stock and never confirms a match.
- Without credentials, a demo extractor returns prepared results for the synthetic sample documents. The UI labels it "Demo".
- Manual entry is a full path, not a fallback screen.

## Consequences

- The match and review UI must handle missing and wrong fields as the normal case.
- Correction counts per document are measurable for the pilot evaluation.
