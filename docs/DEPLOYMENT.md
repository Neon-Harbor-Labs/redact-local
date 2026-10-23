# Deploying to Cloudflare Pages
Redact Local is a static site: the **`public/` folder is the deployment**. There is no build step, no Functions/Workers code, no bindings.

## Option A - upload from your machine (recommended for the first release)
```sh
cd redact-local
npm test                                    # all tests must pass
npx wrangler login                          # once
npx wrangler pages project create redact-local --production-branch main
npx wrangler pages deploy public --project-name redact-local --branch preview   # preview deployment first
```
The command prints a preview URL such as `https://<hash>.redact-local.pages.dev`. Check it (steps below), then promote:
```sh
npx wrangler pages deploy public --project-name redact-local --branch main      # production: https://redact-local.pages.dev
```

## Option B - Git integration
Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > select the repository. Framework preset: **None**. Build command: *(empty)*. Build output directory: **`public`**. No environment variables.

## Custom domain (proposed: `redact.neonharborlabs.com`)
Pages project > Custom domains > Set up a domain > `redact.neonharborlabs.com`. Because `neonharborlabs.com` is a zone in the same Cloudflare account, the CNAME and certificate are created for you. This does not touch the existing `neonharbor-labs-site` Worker (which serves the apex domain).

## Verify every deployment (preview first, then production)
1. `node tools/check-headers.mjs https://<preview-or-production-url>` - must print "All header checks passed". This tests the real response headers (CSP, nosniff, referrer, framing, COOP/CORP, correct MIME types, no cookies, `.gz` not content-encoded).
2. Open the URL in Chrome and Safari: choose a synthetic PDF from `tests/fixtures/pdf/` (a text PDF, `scan_D1_clean300.pdf`, `mixed_text_plus_scan.pdf`), run the whole flow, click **Download**, reopen the download.
3. Open DevTools > Network while processing: every request must go to your own host (plus `blob:`). Console must show no "Refused to ..." CSP messages.
4. Open `/about.html` and `/licenses/AGPL-3.0.txt`; confirm the **Source code** link points at the published repository.
5. Check file delivery: `/vendor/mupdf/mupdf-wasm.wasm` (~10 MB) and `/vendor/tesseract/eng.traineddata.gz` must download completely (Cloudflare Pages limit is 25 MiB per file; `npm run check:size` reports the largest file at 9.93 MiB).

## Zone settings to check
HSTS on (after HTTPS works); Always Use HTTPS on; **off** for this hostname: Web Analytics, Rocket Loader, Auto Minify, Email Address Obfuscation, any script-injecting feature. Do not attach Workers routes or the AI binding to this hostname.

## Rollback
Pages project > Deployments > pick the previous deployment > Rollback. Or redeploy the previous git tag with Option A.

## Updating a vendored library
Edit `tools/vendor-sources.json`, run `node tools/fetch-vendor.mjs --write`, update `THIRD_PARTY_NOTICES.md`, `public/licenses/` and `public/about.html` (versions and licenses), run `npm test`, and re-measure memory (docs/LIMITS.md).
