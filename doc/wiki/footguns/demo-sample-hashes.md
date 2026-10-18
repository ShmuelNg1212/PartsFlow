# Demo sample files and their hashes change together

The demo extractor matches the bundled sample invoices in `public/samples/` by SHA-256. The prepared results live in `supabase/functions/_shared/extraction/demo-fixtures.ts`, keyed by those hashes.

- `node scripts/make-sample-invoices.mjs` re-renders every sample. The PDF embeds its creation date, so its hash changes on every run.
- After a re-render, commit the new sample files and the new `demo-fixtures.ts` together, and redeploy `extract-document`.
- If only one side changes, the demo extractor answers "not available" for the samples.
- Posted documents remember the old hash. A re-rendered sample is not a duplicate of an older post (R-POST-9).
