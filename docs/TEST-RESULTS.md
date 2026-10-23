# Test results (release build 1.0.0, run on the machine that prepared it)
All documents are synthetic; all names and numbers are fictional.

## 1. Automated tests: `npm test` (17 tests, 0 failures)
```
✔ structured identifiers (SSN, cards, banks, phones, emails, DOB, addresses): likely matches are precise and complete
✔ names: rules + language analysis find most names once uncertain matches are included
✔ generic salutations and plain business prose produce no likely detections
✔ compromise suggestions are always "possible" and never overlap other detections
✔ HTTP response headers satisfy the security policy
✔ malformed and unsupported PDFs are rejected with a clear message and never produce output
✔ size and page limits are enforced
✔ text redaction removes every occurrence (incl. rotated page) and keeps unrelated text
✔ forms: field values are flattened then redacted; comments, attachments, bookmarks, metadata are stripped
✔ box over an image: stored image pixels are blanked (not just covered)
✔ a broken redaction engine fails closed: no output is released
✔ nothing selected / nothing matched is an error, not an empty "safe" file
✔ our own pages and scripts load nothing from other origins
✔ required wording, source link and About page are present
✔ no junk, secrets or personal data in the release
✔ vendored files match their pinned upstream hashes
✔ every file fits Cloudflare static-assets limits
```

## 2. Real HTTP response headers (`curl -I` against `tools/serve.mjs`, which applies public/_headers; `tools/check-headers.mjs` also passed)
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'self' blob: data:; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()
Cache-Control: no-cache
```
Checked per path: `/`, `/index.html`, `/about.html`, `/js/app.js`, `/js/worker.js`, the MuPDF .wasm, the pdf.js worker, the Tesseract worker and core, the language data and the AGPL text: all return the headers above, correct Content-Type (`application/wasm`, `text/javascript`, ...), no Content-Encoding on the .gz data and no cookies.
**Re-run after deploying:** `node tools/check-headers.mjs https://<your-url>` (tested on the live Workers static-assets preview, see below).

## 3. No external requests while processing a PDF
- Network log of the browser pane for a complete run (open text PDF, OCR of a mixed PDF, redact, verify, download link): every request is to `127.0.0.1:8790` or `blob:`. No other host.
- Browser self-test (`tests/browser/selftest.js`) on 4 pipelines + 6 rejection cases: **0 CSP violations, 0 resources from other origins, 0 script errors**.
- Policy is enforced, not just declared: from the page, `fetch('https://example.com/')` failed and was reported as a `connect-src` violation; an external image was blocked (`img-src`).

## 4. Malformed and unsupported PDFs fail safely (Node and in the browser UI)
| Input | Result |
|---|---|
| garbage / not a PDF | "This is not a PDF file (missing %PDF header)." No file |
| truncated | "This PDF could not be opened. It may be corrupt or truncated." |
| password-protected | "Password-protected / encrypted PDFs are not supported..." |
| optional-content layers | rejected with explanation |
| XFA form | rejected with explanation |
| 21 pages needing OCR | "...The limit is 20 pages..." |
| over byte / page limit | rejected (Node test) |
| nothing selected or matched | error, no empty file |
| broken redaction engine (simulated) | verification fails, no file released |
In the UI, after a rejected file the work area is hidden, the old result is cleared and no download link exists.

## 5. Browsers (self-test: text PDF, form PDF, scanned PDF with OCR, mixed PDF with OCR, 5 malformed PDFs, OCR page limit)
| Browser | Result |
|---|---|
| Chrome-family 152 (in-app pane) | 10/10 steps OK; 0 violations; 0 external resources |
| Safari 27.0.1 (installed) | 10/10 steps OK incl. OCR; 0 violations; 0 external resources |
| Chrome 152 (regular, via extension) | real click on **Download** saved the PDF (290 KB); reopened with PyMuPDF and pdftotext: selected text gone, unrelated text intact, no metadata/annotations/links |
| Firefox | **not installed on the test machine, not tested** |
| Phones / tablets | not tested (narrow-window layout checked at 420 px: pages scale to fit, no horizontal scroll) |
| OCR unsupported (simulated: WebAssembly SIMD probe forced to fail) | banner: "OCR could not run (this browser does not support WebAssembly SIMD ...), so nothing was detected there" |

## 6. Vendored files and hosting limits
`npm run check:vendor`: 11 files match pinned SHA-256; `node tools/fetch-vendor.mjs --hashes-only`: all 11 equal the hashes published by the package registry mirror.
```
   9.93 MiB  vendor/mupdf/mupdf-wasm.wasm
   3.72 MiB  vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js
   3.72 MiB  vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js
   2.82 MiB  vendor/tesseract/eng.traineddata.gz
   1.21 MiB  vendor/pdfjs/pdf.worker.min.mjs
   0.44 MiB  vendor/pdfjs/pdf.min.mjs
```

## 7. Live preview (Cloudflare Workers static assets, https://redact-local.juleus.workers.dev)
- `node tools/check-headers.mjs <url>` passes (same-origin redirects followed: `/index.html` -> `/`, `/about.html` -> `/about`). Served wasm/OCR data/app.js/HTML are byte-identical to the release files.
- Chrome, in-browser: a synthetic text PDF and a synthetic scanned PDF (OCR) were processed, verified and downloaded; all requests same-origin; no CSP violations or console errors.
- Not tested live: mixed text+image PDF, Firefox, phones/iPhone.
