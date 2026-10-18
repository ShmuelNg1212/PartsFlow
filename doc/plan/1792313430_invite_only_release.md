# First invite-only release: 2026-10-18

Scope: deploy the existing application and record its host settings.
This is one operational change with one documentation commit. Application code is unchanged.
The human authorized deployment and selected invite-only onboarding (R-ROLE-2).

## Release and rollback

- Application commit and previous main: `df22dfa`.
- Previous Worker version: none. This is the first deployment.
- The rollback baseline was recorded in work state before deployment. This file was written after deployment.
- Worker version: `ab236035-3b9c-4888-811a-2d445a2e3e0d`, active at 100%.
- Origin: `https://partsflow.partsflow.workers.dev`.
- Live release marker: `/assets/index-DO25J8rV.js`.
- Production Supabase project: `piijtyewolwrnfimmhnf`.
- Both Edge Functions are active at version 1. Each validates the caller in its handler.
- No Git push or repository deployment connection was made.
- For a later release, use the rollback commands in `doc/wiki/setup.md`.
- This first release has no previous Worker version to restore.

## Completed checks

- [x] tests: alongside. Run unit and database tests with the production build variables. Done: 216 tests pass. The database harness used local PostgreSQL, not production.
- [x] tests: alongside. Run lint and the production build. Done: both pass.
- [x] tests: alongside. Run hosted development browser tests. Done: 31 pass and 11 cases are skipped by viewport. These tests did not write production data.
- [x] tests: alongside. Check production isolation. Done: all 10 application tables have RLS; document storage is private; no shop, user, product, document, or stock movement rows were copied.
- [x] tests: alongside. Deploy the frontend and verify the release marker. Done: Chrome loads the live sign-in page with the matching JavaScript asset.
- [x] tests: alongside. Verify the served JavaScript. Done: its SHA256 matches the local release. It contains the production backend URL and excludes the development backend URL.
- [x] tests: alongside. Check navigation and missing files. Done: the live route script passes.
- [x] tests: alongside. Deploy backend functions and check access. Done: each function rejects an unsigned POST with 401.
- [x] tests: alongside. Configure the production origin. Done: Auth Site URL, exact password redirect, and function APP_ORIGINS are saved.
- [x] tests: alongside. Verify the function origin. Done: both function OPTIONS responses allow the exact production origin.
- [x] tests: alongside. Verify R-ROLE-2. Done: the hosted Auth settings endpoint reports public signup disabled.

## Limits at release

Production has no owner account. Authenticated live stock access and draft writes are pending.
Custom SMTP and invitation delivery are pending. No email was sent.
The isolated real Supabase database suite and real-phone checks remain pending from the pilot plan.
Docker is not installed on this machine. The local database tests use the existing shim.
Azure credentials and extraction evaluation are pending. The deployed extractor has the labelled demo fallback.
The security advisor reports the 10 intended authenticated SECURITY DEFINER APIs and access helpers.
The dependency audit reports seven high entries in the build-time shadcn CLI chain.
Those tools are not part of the static Worker's runtime. No dependency version was changed for release.
The first hostname checks failed during certificate availability. Chrome and the route check then passed without a TLS bypass.

Use `doc/wiki/setup.md` for current operation instructions.
