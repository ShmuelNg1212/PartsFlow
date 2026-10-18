# Setup and operation

## Development

Use Node.js 22.12 or later and npm. Run `npm ci`.
Copy `.env.example` to `.env.local`. Set the two `VITE_SUPABASE_*` values for the development project.
Use a publishable key in the browser. Keep database credentials in `.env.local` only.
Run `npm run dev`. Open `http://localhost:5173`.

The hosted development project is `urljzpqigvtoooitwjrd`.
Keep real shop data out of this project. Browser tests add data to the E2E test shop.

## Database and functions

Set `SUPABASE_DB_URL` to the Session pooler connection string.
The direct database host needs IPv6, which this development machine cannot reach.
Apply pending migration files in filename order:

```sh
node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

The script uses one transaction per file. It records the filename in the migration table.
Do not edit a migration that is already applied.

The hosted development project has the current migrations and both Edge Functions.
The functions are `invite-member` and `extract-document`.
Both use `verify_jwt = false` in CLI configuration. Each function validates the caller with Auth before it uses server privileges.
Use the repository's Supabase CLI configuration when deploying these functions.

Set `APP_ORIGINS` on the Edge Functions to the allowed app origins, separated by commas.
The development default is `http://localhost:5173`.
For Azure extraction, set `AZURE_DOCINTEL_ENDPOINT` and `AZURE_DOCINTEL_KEY` as function secrets.
Without both values, extraction uses labelled synthetic samples only.

Before real invitations, configure the hosted Auth Site URL, the redirect URL for `/set-password`, SMTP, and `APP_ORIGINS`.
Turn off public sign-up in the hosted Auth dashboard. Local `config.toml` does not change hosted Auth settings.
Email delivery has not been verified.

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

Build command: `npm run build`. Output directory: `dist`.
The app refuses to start if the browser Supabase configuration is missing.
The build alone does not prove that the host variables are correct.
The host is not selected. Deploy and rollback commands are not set.
Before shipping, record those commands here and run the tests with the host build variables.
Configure an SPA fallback: unknown application paths must return `index.html`. Static assets must keep their normal 404 response.
Record the previous main commit in the release plan before a push.
Verify a version-specific marker on the live site after deployment.

## Extraction evaluation

Azure evaluation is not done. It needs credentials and representative invoices that the shop agrees to share.
Use `scripts/eval-extraction.ts` with a folder containing invoices and `truth.json`.
The script writes `evaluation.md` and `evaluation.json` in that folder.
Keep real invoices and evaluation output outside Git.

## Security advisor record (2026-10-18)

The hosted advisor reports 10 authenticated `SECURITY DEFINER` entry points.
These are intentional APIs and access helpers. Each checks membership or owner access.
The schema and database tests verify the grants and rejected callers.
See the [function-execution advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The advisor also reports that leaked-password protection is disabled on hosted Auth.
Review this hosted setting before real member invitations.
See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
