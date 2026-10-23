# Deploying to Cloudflare Workers (static assets)
Redact Local is a static site: the **`public/` folder is the deployment**. It is hosted as a **Cloudflare Worker with static assets and no Worker script**: no build step, no Functions code, no bindings (no AI, KV, R2, D1). Static-asset requests are served directly by Cloudflare and `public/_headers` is applied.

The v1.0.0 preview runs at `https://redact-local.juleus.workers.dev` (Worker name `redact-local`). It is **not** a Cloudflare Pages project, and no production or custom-domain deployment exists yet.

## Deploy from your machine
`wrangler.jsonc` is deliberately not committed. Create it temporarily (or pass the equivalent flags) and do not commit it:
```jsonc
{ "name": "redact-local", "compatibility_date": "2026-10-06", "assets": { "directory": "public" } }
```
```sh
cd redact-local
npm test                 # all tests must pass
npx wrangler login       # once
npx wrangler deploy      # uploads public/ as static assets
```
Do not add a `main` script, `ai`, or any other binding. Do not run `wrangler pages project create`: with current wrangler it also creates a Workers project. Keep `workers_dev` as is until a custom domain is approved.

## Custom domain (proposed, NOT done: `redact.neonharborlabs.com`)
Worker > Settings > Domains & Routes > Add custom domain. This does not touch the existing `neonharbor-labs-site` Worker (which serves the apex domain). Not applied; requires explicit approval.

## Verify every deployment (preview first, then production)
1. `node tools/check-headers.mjs https://<preview-or-production-url>` - must print "All header checks passed". It follows same-origin redirects only (Cloudflare redirects `/index.html` to `/` and `/about.html` to `/about` with a 307); a redirect to another origin fails. This tests the real response headers (CSP, nosniff, referrer, framing, COOP/CORP, correct MIME types, no cookies, `.gz` not content-encoded).
2. Open the URL in Chrome and Safari: choose a synthetic PDF from `tests/fixtures/pdf/` (a text PDF, `scan_D1_clean300.pdf`, `mixed_text_plus_scan.pdf`), run the whole flow, click **Download**, reopen the download.
3. Open DevTools > Network while processing: every request must go to your own host (plus `blob:`). Console must show no "Refused to ..." CSP messages.
4. Open `/about.html` and `/licenses/AGPL-3.0.txt`; confirm the **Source code** link points at the published repository.
5. Check file delivery: `/vendor/mupdf/mupdf-wasm.wasm` (~10 MB) and `/vendor/tesseract/eng.traineddata.gz` must download completely (Cloudflare static-assets limit is 25 MiB per file; `npm run check:size` reports the largest file at 9.93 MiB).

## Zone settings to check
HSTS on (after HTTPS works); Always Use HTTPS on; **off** for this hostname: Web Analytics, Rocket Loader, Auto Minify, Email Address Obfuscation, any script-injecting feature. Do not attach other Workers routes or any AI binding to this hostname.

## Rollback
Worker > Deployments > Rollback to a previous version, or `git checkout v1.0.0` and `npx wrangler deploy`.

## Updating a vendored library
Edit `tools/vendor-sources.json`, run `node tools/fetch-vendor.mjs --write`, update `THIRD_PARTY_NOTICES.md`, `public/licenses/` and `public/about.html` (versions and licenses), run `npm test`, and re-measure memory (docs/LIMITS.md).
