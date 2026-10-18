# Glossary

Use these terms in code, UI, and docs. Do not use the listed synonyms for a different meaning.

- **Shop**: one owner-operated auto supply business. The pilot supports one shop with one stock location.
- **Member**: a user in a shop, with the role owner or staff.
- **Owner**: a member who can post, reverse, manage products, override duplicates, and change settings.
- **Staff**: a member who can search stock and prepare drafts. Staff cannot post.
- **Product**: one stock item, identified by SKU. Brand + manufacturer part number describes it. Two brands are two products.
- **Base unit**: the unit in which a product's stock is counted (for example "pc", "L", "set"). All movement quantities use it.
- **Unit conversion**: an explicit factor from an invoice unit to the base unit (for example 1 box = 10 pc). The user enters it; the app never guesses it.
- **Counterparty**: the supplier on a receipt, or the customer on a sale.
- **Supplier alias**: a confirmed mapping from a counterparty's line description or part number to a product. Used for match suggestions only.
- **Document**: one invoice or receipt that the shop already has, as an uploaded file and/or manual entry. PartsFlow records documents; it does not issue them.
- **Direction**: the purpose of a document: **receipt** ("Receive stock") or **sale** ("Record a sale").
- **Document line**: one item row on a document.
- **Raw value**: a value as the extractor returned it. It never changes.
- **Corrected value**: the value a user confirms or edits. Posting uses corrected values only.
- **Draft**: a document that is not posted. A draft never changes stock.
- **Extraction**: reading a document file to propose a draft. Its output is untrusted.
- **Demo extractor**: an extractor that returns prepared results for synthetic sample documents only. Always labelled "Demo".
- **Match**: the link from a document line to a product. **Ambiguous match**: more than one candidate, or low confidence; the user must select.
- **Post** (confirm): the owner action that commits a draft's stock movements and sets the document to posted, in one transaction.
- **Posted**: a document whose movements are in the ledger. A posted document does not change.
- **Reversal**: an owner action, with a reason, that makes compensating movements linked to a posted document and sets it to reversed.
- **Stock movement**: one ledger entry: product, signed quantity in base units, source, timestamp, actor, reason.
- **Ledger**: all stock movements. The source of truth for balances.
- **Balance** (on hand): the sum of a product's movements.
- **Low stock**: balance at or below the product's reorder threshold.
- **Duplicate**: a document that shares a file hash, or a document number + counterparty, with another document.
- **Recorded sales**: the total of posted sale documents. Not cash received. Not profit.
- **Opening quantity**: the first balance of a product, recorded as a movement with source `opening`.
