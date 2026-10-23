# Security review checklist
Status key: **TESTED** = automated test or recorded manual test in docs/TEST-RESULTS.md; **REVIEWED** = checked by reading the code/config; **NOT AUDITED** = not independently verified.

## Data handling and privacy
| Requirement | Status | Evidence |
|---|---|---|
| PDFs are never uploaded; no external PDF processing | TESTED | CSP `connect-src 'self'`; network log of a full text + OCR run shows only same-origin and `blob:` requests; page-level `fetch('https://example.com')` and an external image are blocked and reported as CSP violations |
| No analytics, trackers, third-party scripts, fonts or CDNs | TESTED | `tests/static.test.mjs` (no external `src`/`href`/`fetch`/`import`, no inline scripts or handlers) |
| No cookies, localStorage, IndexedDB, service workers | TESTED + REVIEWED | static test greps our scripts; Tesseract is configured with `cacheMethod: 'none'`; server sets no cookies (header test) |
| Document text is never written into the page as HTML | TESTED | static test forbids `innerHTML`/`eval`/`document.write` in our scripts; all document text is inserted with `textContent` |
| Blob URLs (page previews, download) are released when a new file is opened | REVIEWED | `blobUrl()` / `revokeObjectURL` in `app.js` |

## HTTP headers (Cloudflare Workers static-assets `_headers`)
Tested against the real HTTP responses of `tools/serve.mjs` (which applies `public/_headers`) with `tools/check-headers.mjs`; **re-run it against the live URL after deploying** (`node tools/check-headers.mjs https://redact-local.juleus.workers.dev`; it follows same-origin redirects only).
- `Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'self' blob: data:; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` - no `unsafe-inline`, no `unsafe-eval`, no remote hosts. `'wasm-unsafe-eval'` is required to run the MuPDF and Tesseract WebAssembly.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` (plus `frame-ancestors 'none'`), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy` denying camera, microphone, geolocation, etc.
- Correct `Content-Type` for `.wasm`, `.js`/`.mjs`; the `.gz` language data must not be sent with `Content-Encoding` (checked by the script).
- HSTS: enable in the Cloudflare zone (SSL/TLS > Edge Certificates) after confirming HTTPS works; not set by `_headers`.

## Malformed and unsupported input
TESTED (Node and in-browser, Chrome and Safari): empty/garbage/truncated PDFs, encrypted PDFs, PDFs with optional-content layers, XFA forms, a 21-page scanned PDF over the OCR limit, a size over the byte limit, a page count over the limit, "nothing selected/matched", and a deliberately broken redaction engine. In every case the tool shows a message and offers no file.
NOT TESTED: fuzzing with large corpora of real-world malformed PDFs; PDFs crafted to exploit parser bugs in MuPDF/pdf.js/Tesseract (a browser tab crash or hang is the likely worst case, with no document data leaving the device).

## Redaction correctness
- Selected text is removed from the page content; image pixels under each box are blanked in the stored image (TESTED: dark-ink pixel counts inside redacted boxes drop to zero in the exported file's own image data).
- Hidden data stripped and structurally re-checked: metadata (Info, XMP), annotations/comments (visible ones flattened first), form fields (values flattened), attachments, bookmarks, links, JavaScript/open actions, thumbnails, accessibility tags (TESTED with a document containing every one of these, plus a whole-file scan of every object, decoded stream and the raw bytes for planted secrets).
- Independent second check with pdf.js (text extraction, black-box render, structure) and, for OCR pages, a second OCR pass on the export (same engine, so weaker).
- Known leak classes **not covered**: unusual private dictionary keys, font names, previous revisions of incrementally updated files (the file is rewritten, but this was not tested on such files), digital signatures (invalidated), PDF/A conformance (lost), text that detection never found (the UI says so), small images under about 2% of a page.
- The UI never claims complete anonymisation; "verified" is defined on the page.

## Supply chain
- All third-party code is vendored, unmodified, pinned in `tools/vendor-sources.json` with SHA-256 (TESTED: `npm run check:vendor`, and `fetch-vendor.mjs --hashes-only` against the hashes published by the package registry mirror).
- No npm dependencies, no build step, no install scripts. Updating a vendored file requires editing `vendor-sources.json` and re-verifying (`fetch-vendor.mjs --write`).
- NOT AUDITED: the upstream projects themselves (MuPDF, pdf.js, Tesseract, compromise). Watch their security advisories.

## Hosting
- Static files only, served as a Cloudflare Worker with static assets and no Worker script: no Functions code, no bindings, no AI binding; the `redact-local` Worker is separate from every existing Workers project (see docs/NEON-HARBOR-INTEGRATION.md).
- Turn off Cloudflare features that inject scripts or rewrite HTML (Web Analytics beacon, Rocket Loader, Auto Minify, Email Address Obfuscation); CSP would block injected scripts anyway.

## Not independently audited
This whole project: no third-party penetration test, code audit or cryptographic review has been done. Firefox has not been tested (not installed on the test machine); Chrome-family and Safari were. Phones/tablets not tested. Recommend an independent review before promoting the tool beyond a "free tool, use with care" status.
