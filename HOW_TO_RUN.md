# How to run KashWise

KashWise is a local-work marketplace with **Earn My Goal**, **ProofScript** (your work transcript), and **iBanks**
earnings intelligence. The web app uses React/Vite, Supabase and Netlify Functions. The Expo mobile app uses the same
backend. Payments, savings and retirement allocations are simulations; no bank or real-money payment provider is connected.

## 1. Prerequisites

- Node.js **22** and npm (run `node --version` and `npm --version` to check).
- Git and access to this repository.
- A configured Supabase project with the repository migrations applied.
- For the full app, Netlify CLI **27.14.2**; the commands below run that pinned version through `npx`.

```sh
git clone https://github.com/Boitybanks/kashwise.git
cd kashwise
npm ci
```

`npm ci` installs the exact dependency versions in `package-lock.json`. Run commands from the repository root unless
a section explicitly changes directories.

## 2. Configure local environment variables

Copy the template using your shell:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```sh
# macOS / Linux
cp .env.example .env
```

Open `.env` in your editor and set the public Supabase URL and publishable key from your project. Never use a
service-role/secret key as the publishable key. `.env`, `.env.local` and `.netlify/` are already ignored by Git.

| Variable | Where it is used | Requirement |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser and server functions | Required; Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser and server functions | Required; public publishable key. |
| `PQ_KEM_SECRET_SEED` | Server functions only | Required for encrypted contact disclosure; base64-encoded 32 bytes. |
| `PQ_SIGN_SEED` | Server functions only | Required for signed ProofScript records, skills profiles and statements. |
| `IBANKS_PROVIDER_WEBHOOK_SECRET` | Server functions only | Required for the payment simulator, iBanks ingestion and scheduled outbox; same value as the Supabase Vault secret `ibanks_provider_webhook_secret`, at least 32 random characters. |
| `PAYMENTS_MODE` | Server functions only | `sandbox` enables labelled simulated payments. Leave unset to disable the simulator. |
| `IBANKS_LLM_PROVIDER` | Server functions only | Use `none` for rules-based iBanks without an AI API key. |
| `ANTHROPIC_API_KEY` | Server functions only | Optional; only for configured, worker-approved AI rephrasing/skills profiles. |
| `GRAPHITI_SERVICE_URL`, `GRAPHITI_SERVICE_TOKEN` | Server functions only | Optional preference-memory service. Core goal planning works without it. |

Retain the existing production PQ seeds. Replacing them can break decryption of existing contacts or verification
of existing signed records. `npm run keys:generate` is for a **new, isolated setup**, with its generated public keys
and secret seeds kept together; do not run it to refresh an established production project.

Do not prefix server secrets with `VITE_` or `EXPO_PUBLIC_`: those prefixes expose values in distributed app bundles.

## 3. Start the full web app

```sh
npx --yes netlify-cli@27.14.2 dev
```

Open the local URL printed by Netlify Dev (normally `http://localhost:8888`). This serves both the Vite frontend and
the `/api/*` Netlify Functions. Stop the process with Ctrl+C.

For frontend-only work:

```sh
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). This mode does not serve Netlify Functions, so features
that call `/api/*`, including Earn My Goal's server endpoint and signed document generation, need Netlify Dev.

## 4. Prepare the Supabase database

Apply migrations in filename order from `supabase/migrations/` using the Supabase CLI or SQL editor. For an existing
project, inspect its migration history first and apply only missing migrations. Never replay the original schema or
seed migrations over an existing database. Review and back up the target before applying schema changes.

The feature migrations added after the original 13 migrations are:

1. `20261008000100_ibanks_ledger.sql` — provider events, append-only ledger, iBanks tables and updated completion/payout RPCs.
2. `20261009000100_ibanks_outlook_and_diagnostics.sql` — outlook, worker diagnostics, payment-confirmed evidence and outbox dispatch.
3. `20261023000100_earn_goals.sql` — earning goals, matching context, preference consent and posting eligibility.

The first migration changes completion/payment accounting: a client's completion confirmation creates proof; a
separate provider settlement creates earned income. Keep that distinction in demos and test accounts.

Configure the shared HMAC secret in **Supabase Vault** under `ibanks_provider_webhook_secret` and in the server
environment as `IBANKS_PROVIDER_WEBHOOK_SECRET`. Never commit either value or put it in the browser.

Configure Supabase Auth's site URL and permitted redirect URLs for the intended local/hosted app. The migrations
define the expected storage buckets and access rules; preserve those rules for evidence, avatars and documents.

## 5. Check the app

```sh
npm run typecheck
npm run lint
npm run test:serial
npm run build
```

The normal test suite uses local fixtures/PGlite. It does not need a production database. `test:serial` runs test
files one at a time and is useful on OneDrive or memory-constrained machines.

`npm run test:journey` is different: it writes demo data to the configured live database. Run it only against an
explicitly chosen test environment; it is not part of the routine checks above.

Read-only hosted checks, after deployment:

```sh
node scripts/release-smoke.mjs
```

The smoke script checks branding, assets, route handling and unauthenticated API rejection. It does not prove a
complete signed-in job/payment journey.

## 6. Deploy the complete web app to Netlify

Use the **Boitybanks/kashwise** repository, production branch **main**, build command `npm run build`, publish directory
`dist`, and the committed `netlify.toml`. The functions directory is `netlify/functions`; publish all functions,
including `earn-goal`, `ibanks-ask`, `payments-webhook`, `payments-sandbox` and scheduled `ibanks-outbox`.

Set public configuration for **Builds and Functions**. Set server secrets for **Functions**; use Netlify's secret
flag. Existing secrets must retain their values. Environment variables in the TOML build section are not runtime
secrets. Optional AI and Graphiti memory can remain disabled for a functional core release.

Preferred deployment is Netlify's Git connection so a push to `main` builds the same committed source. A manually
uploaded frontend-only `dist` folder does not deploy the backend functions and is not a complete release.

For an authenticated CLI release to the existing site:

```sh
npx --yes netlify-cli@27.14.2 login
npx --yes netlify-cli@27.14.2 link --id f8d681ec-ab68-4d61-8a9a-586be62127b7
# Or run: npm run deploy:kashwise
npm run build
npx --yes netlify-cli@27.14.2 deploy --prod --dir=dist --functions=netlify/functions
```

The `.netlify/` folder created by linking is ignored by Git. When Git deployment is connected, its next production
push supersedes a manual deployment; deploy the same branch/commit to avoid divergence. Verify the published deploy's
functions, environment configuration and live routes after publishing. The existing hosted address is
`https://sidegigs-codecraft.netlify.app`; the domain name alone does not indicate which app version is deployed.

## 7. Run the Expo mobile app

```sh
cd mobile
npm ci
```

Copy `mobile/.env.example` to `mobile/.env` using the shell-specific copy command above. Set
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_API_BASE` (the origin of the deployed
Netlify backend). Use only public values in this file.

```sh
npm run typecheck
npm start
```

Use the Expo tooling's device/emulator instructions. The project uses Expo SDK 57; device support/build requirements
must match that SDK. Android/iOS app-store or installable binary publication is separate from deploying the web app.
Do not call a web release a tested native release. See `mobile/README.md` for current native feature boundaries.

## 8. Optional local preference memory

Follow [docs/GRAPHITI_LOCAL.md](docs/GRAPHITI_LOCAL.md) for the pinned Graphiti fork, Ollama and Neo4j service. This is
optional. Netlify cannot connect to a laptop's loopback address. A public memory service needs private authenticated
hosting, persistence, queue/retry monitoring and its own deployment validation before enabling it in production.

## Common problems

| Symptom | Check |
| --- | --- |
| App says Supabase is not configured | Replace both public placeholders, then restart the dev server/rebuild. |
| `/api/*` returns HTML locally | Use Netlify Dev rather than Vite alone. |
| Earn My Goal or iBanks returns 503 | Confirm its migrations and server environment variables are applied to the same Supabase project. |
| Signed credentials/contact disclosure fail | Confirm the original matching PQ seeds and public keys are configured in server scope. |
| Simulated settlement fails | Check `PAYMENTS_MODE=sandbox` and the identical HMAC secret in Netlify and Supabase Vault. |
| A route works after clicking but fails on refresh | Confirm the SPA fallback in `netlify.toml` was deployed. |
| New branding is absent on the hosted app | Confirm the published deploy was built from this repository's latest `main`; refresh the page. |
