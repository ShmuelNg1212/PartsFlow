# Setup and operation

## Development

Use Node.js 22.12 or later and npm. Run `npm ci`.
Copy `.env.example` to `.env.local`. Set the two `VITE_SUPABASE_*` values for the development project.
Use a publishable key in the browser. Keep database credentials in `.env.local` only.
Run `npm run dev`. Open `http://localhost:5173`.

The hosted development project is `urljzpqigvtoooitwjrd`.
Keep real shop data out of this project. Browser tests add data to the E2E test shop.
The production project is `piijtyewolwrnfimmhnf` (`partsflow-production`, Singapore, Free plan).
Its connection settings are in ignored `.env.production.local`.
Run production database commands with `node --env-file=.env.production.local`.

## Database and functions

Set `SUPABASE_DB_URL` to the Session pooler connection string.
The direct database host needs IPv6, which this development machine cannot reach.
Apply pending migration files in filename order:

```sh
node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

The script uses one transaction per file. It records the filename in the migration table.
Do not edit a migration that is already applied.

Both hosted projects have the current 12 migrations and both Edge Functions.
The functions are `invite-member` and `extract-document`.
Both use `verify_jwt = false` in CLI configuration. Each function validates the caller with Auth before it uses server privileges.
Use the repository's Supabase CLI configuration when deploying these functions.

Set `APP_ORIGINS` on the Edge Functions to the allowed app origins, separated by commas.
The development default is `http://localhost:5173`.
The hosted `extract-document` function uses the labelled demo extractor. It recognizes synthetic samples only.
Local PaddleOCR runs only in local development. See [Local OCR](#local-ocr-development-only).

Before real invitations, configure the hosted Auth Site URL, the redirect URL for `/set-password`, SMTP, and `APP_ORIGINS`.
Turn off public sign-up in the hosted Auth dashboard. Local `config.toml` does not change hosted Auth settings.
Production Auth uses `https://partsflow.partsflow.workers.dev` as its Site URL.
The exact `/set-password` URL is allowed. `APP_ORIGINS` has the same production origin.
The production Auth settings endpoint confirms that public sign-up is disabled.
Custom SMTP is not configured. Email delivery has not been verified.

## Seed

```sh
node scripts/seed-dev-users.mjs
node scripts/seed-demo.mjs
node scripts/seed-live-shop.mjs --name "Shop name" --owner-email owner@example.com
```

The first command creates test owner and staff accounts.
The second command creates the separate demo shop and about 40 synthetic products.
Both commands store generated account credentials in ignored `.env.local`.
The third command creates an empty live shop and its first owner. It stores the generated password as `LIVE_OWNER_PASSWORD`.
For production, pass `--env-file=.env.production.local` to Node before the script name.
The seed still writes a generated owner password to ignored `.env.local`. Treat that file as private.
Provision each pilot shop separately after the human supplies its name and owner email.
Production has one shared demo shop for testers (2026-10-18, approved by the human). It is the labelled `is_demo` shop with the synthetic catalog. Its users are `demo-owner@partsflow.test` (owner) and `demo-staff@partsflow.test` (staff). Their passwords are in ignored `.env.production.local`, not `.env.local`. Testers share this shop. They can see and change each other's entries. Production has no live shop yet.
To reset the demo passwords, change them in `.env.production.local` and run `node --env-file=.env.production.local scripts/seed-demo.mjs` again. The seed does not duplicate data.
Give this password to the owner through a private channel. Change it in Settings.
Seeds use PHP and Asia/Manila by default. Settings can change both.

Synthetic invoices are in `public/samples/`. Each has a sample label.
See [sample hashes](footguns/demo-sample-hashes.md) before changing these files.

## Checks

```sh
npm test
npm run test:db
npx playwright test
npm run typecheck
npm run lint
npm run build
```

The database suite needs local PostgreSQL with permission to create databases.
It deletes and creates the local `partsflow_test` database on each run.
`TEST_PG_URL` selects the local server. Its default is `postgres://localhost:5432/postgres`.
Never point this harness at the hosted development or live database. It installs a test Auth and Storage shim.
A full database-suite run on an isolated real Supabase stack is still required before the live pilot.

Playwright uses the hosted development project and accounts from the first seed command.
It starts Vite on port 5173. Run one Playwright process at a time.
The `desktop` and `phone` projects check both layouts.
`e2e/design-pass.spec.ts` uses API fixtures for long identifiers, large quantities, and empty stock. It saves screenshots at 320, 768, 1366, and 2560 px and with enlarged text.
Real-device keyboard, safe-area, and touch checks are still required.

## Build, deployment, and rollback

Cloudflare Workers Static Assets is the selected frontend host (human decision, 2026-10-18).
Supabase remains the backend. The live app is `https://partsflow.partsflow.workers.dev`.
Wrangler is authenticated. No custom domain or Git deployment integration is configured.
The Worker name in `wrangler.jsonc` is `partsflow`. Change it if the account already uses that name.
Wrangler is pinned in the lockfile. Use the local npm commands below.

### Production configuration

Copy `.env.production.example` to ignored `.env.production.local` for local release builds.
Set the production project's `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
In Cloudflare Builds, set these as build variables. Runtime Worker variables do not configure the compiled browser app.
The production preflight requires explicit values. It does not fall back to the development `.env.local`.
It checks an HTTPS origin and a publishable-key format. It rejects server secrets. It does not verify account access.
Keep production data out of the development project.

Build command: `npm run build:production`. Output directory: `dist`.
Use `npm run build` for local development checks against the development project.
The browser still checks its configuration at startup. A successful build is not proof of sign-in or database access.

### Local host checks

```sh
npm run build
npm run deploy:check
npm run preview:cloudflare
```

The dry run packages the Worker without publishing it.
The preview uses Cloudflare's local runtime on `http://localhost:8787`.
In another terminal, run `node scripts/check-cloudflare-routes.mjs`.
Check sign-in and a saved draft through that local server before a release.

Existing assets are served directly. A small Worker handles unmatched routes.
It serves `index.html` for app routes. Missing file paths return 404.
The default global SPA fallback was tested and returned HTML for missing scripts, so it is not used.
Unmatched routes invoke Worker code and count toward the Worker request allowance.
The Worker has only an asset binding. It needs no backend secrets.
An empty `secrets.required` list prevents local database and test credentials from becoming runtime bindings.

### Deployment and rollback

Authentication command: `npx wrangler login`.
Account check: `npx wrangler whoami`.
Deployment command, after the human says ship: `npm run deploy`.
This runs the production preflight, builds the app, and deploys it.
For Cloudflare Builds, use `npm run build:production` as the build command and `npx wrangler deploy` as the deploy command.
Connecting a repository with Save and Deploy publishes it. Do this only in an authorized release.
If main is connected later, a push to main deploys it. Keep each push within the approved release scope.

Record the previous main commit and Cloudflare version ID in the release plan before a release.
List deployed versions with `npx wrangler versions list`.
Rollback command: `npm run rollback -- <previous-version-id>`.
A Worker rollback does not reverse database migrations or stock movements.
Before shipping, run the tests with the host build variables.
Verify a marker unique to the release on the live site after deployment.
Also verify a direct document link, authenticated stock access, a draft write, and a missing static file.
Configure the final origin in Supabase Auth and `APP_ORIGINS` before testing real invites.

Host references: [Workers static assets](https://developers.cloudflare.com/workers/static-assets/get-started/),
[Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/),
and [rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Preparation check (2026-10-18): 83 unit tests pass. Local Cloudflare navigation and missing-asset checks pass.
Wrangler dry run, build, TypeScript, and lint pass. A staff user signed in, saved a draft, and reloaded its deep link through the local Cloudflare server. These browser checks used the development test shop.
The first production release is recorded in [the release record](../plan/1792313430_invite_only_release.md).
The live sign-in page and release asset are verified. Live routes and missing-file checks pass.
Production sign-in, stock access, and draft writes need a first owner account.
The npm audit lists seven existing high-severity entries in the shadcn CLI dependency chain; none are in Wrangler.
The first release audit confirms these entries are in the build-time shadcn CLI chain.
The static Worker has no npm runtime dependencies. Keep the dependency findings open for maintenance.
Do not run a forced dependency downgrade as part of host setup.

## Local OCR (development only)

PaddleOCR runs on this Mac. The app still uses the hosted development Supabase project. The Mac must run three processes:

| Process | Address | Command |
|---|---|---|
| OCR worker | 127.0.0.1:8765 | `cd ocr && OCR_WORKER_TOKEN=$T PADDLE_PDX_CACHE_HOME=/private/tmp/partsflow-paddlex-cache uv run python worker.py` |
| Bridge | 127.0.0.1:8766 | `OCR_WORKER_TOKEN=$T node scripts/ocr-bridge.ts` |
| App | localhost:5173 | `VITE_LOCAL_OCR=true npm run dev` |

1. Install once: `cd ocr && uv sync`. This uses Python 3.11 and `ocr/uv.lock`.
2. Make a token for this session: `export T=$(openssl rand -hex 24)`. Give the same token to the worker and the bridge.
3. Start the worker. The first start downloads about 146 MB of models into the cache and takes about 70 s. A cached start takes about 3 s.
4. Start the bridge. It reads `.env.local`. It refuses to start unless every Supabase value names the development project `urljzpqigvtoooitwjrd`.
5. Start the app with `VITE_LOCAL_OCR=true`. Without the flag, the app uses the hosted demo extractor.
6. Check readiness: `curl -s 127.0.0.1:8766/health` returns `{"bridge":true,"scanner":true}`.

Stop each process with Ctrl+C. The worker uses about 5 GB of memory while it runs. One page takes about 7 to 11 s on CPU.
The worker reads one document at a time. Limits: 10 MB and 5 pages (`OCR_MAX_BYTES`, `OCR_MAX_PAGES`). The bridge waits 120 s for a read.

Troubleshooting:
- The draft says "The local scanner is not running": the worker or the bridge is down. Start both, wait until `/health` shows `"scanner":true`, then upload again.
- The bridge exits at start: a `.env.local` value names another project, or the token is shorter than 32 characters.
- The bridge has no Supabase secret key. It uses the user's session for Storage and `SUPABASE_DB_URL` for `apply_extraction`.
- No lines on a photo: more than a quarter of its text was read with low confidence. Enter the lines by hand.

What the mapper reads, and its limits, are in `supabase/functions/_shared/extraction/paddle.ts`. Measured results: [synthetic evaluation](../study/1792320512_paddleocr_synthetic_eval.md).

Browser check: with the three processes running, run `LOCAL_OCR_E2E=1 npx playwright test e2e/local-ocr.spec.ts`. Stop the worker and run `LOCAL_OCR_E2E=stopped` for the failure path. Restart the app without the flag before the normal suite, because the normal suite expects the demo extractor.

## Extraction evaluation

Generate new synthetic invoices outside the checkout:

```sh
node scripts/make-extraction-cases.mjs /private/tmp/partsflow-extraction-cases
```

The generator uses Playwright Chromium. It does not alter canned demo fixtures.
It writes six labelled PDF and photo cases, source HTML, and `truth.json`.
No OCR runs in this command. With the worker running, `OCR_WORKER_TOKEN=$T node scripts/eval-local-ocr.ts` reads every case and the bundled demo samples, and writes the report to `/private/tmp/partsflow-paddle-eval.md`.

The provider-independent scorer and report are in `supabase/functions/_shared/extraction/`.
The report names the provider from the recorded results. It does not invent a provider when no read exists.
Failed and omitted reads remain in field denominators. Missing and extra lines are reported.
Exact product codes stay distinct. Decimal comparisons preserve precision.
Synthetic results do not establish real-shop accuracy. Later tests need invoices the shop permits us to process.
Keep invoice files, reference answers, and raw results outside Git.

## Security advisor record (2026-10-18)

The hosted advisor reports 10 authenticated `SECURITY DEFINER` entry points.
These are intentional APIs and access helpers. Each checks membership or owner access.
The schema and database tests verify the grants and rejected callers.
See the [function-execution advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The advisor also reports that leaked-password protection is disabled on hosted Auth.
Review this hosted setting before real member invitations.
See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
