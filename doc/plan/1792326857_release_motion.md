# Release: motion pass

Date: 2026-10-18. Mode: design. The human said "ship it".

## Scope

- Frontend only: `main` at `a85e25e` to Cloudflare Worker `partsflow`.
- No Edge Function change. No database migration.
- 5 commits since `98a225b`, all covered by the approval:
  - `6c813aa` docs: study and plan a restrained motion pass
  - `86f7280` docs: add page transitions to the approved motion plan
  - `d899f52` feat: add restrained motion for pages, alerts, dialog steps, and new lines
  - `7613d7e` fix: keep motion tokens off Tailwind's easing and slide every dialog step
  - `a85e25e` docs: record motion pass checks and document motion in the wiki
- Plan: [1792325769_motion_pass.md](1792325769_motion_pass.md).

## Rollback baseline

- Previous main commit: `98a225b`.
- Previous Worker version: `bc75f06f-d8cf-46d1-8745-ffc172d52bd3`. Rollback: `npm run rollback -- bc75f06f-d8cf-46d1-8745-ffc172d52bd3`.

## Checks

- [x] With the production `VITE_` build variables: `npm test` 126 pass, lint and typecheck clean, `npm run build:production` passes. The database tests were not run with the production file, because they could write to the production database.
