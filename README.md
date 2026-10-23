# Redact Local

**A free, private PDF redaction tool that automatically finds names, addresses, phone numbers and other sensitive information—even in scanned documents.**

Redact Local runs entirely in your browser. Your PDF is never uploaded: all code, WebAssembly and OCR language data are served from the same origin, and a strict Content-Security-Policy forbids connections to anywhere else.

> **Not a guarantee.** Detection can miss information (especially names and addresses, and anything OCR cannot read). You review the detections before anything is changed, and you must inspect the exported file before sharing it. "Verified" means the items you selected were removed and hidden data was stripped; it does **not** mean every sensitive item was found. This software has **not** been independently security-audited. See [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md).

## How it works
1. Choose a PDF. Text is read with MuPDF; pages that are images (or large images on text pages) are read with Tesseract OCR.
2. Pattern + context rules (SSN, cards, bank/ID numbers, phones, emails, dates of birth, addresses) and the `compromise` NLP library (names) highlight and **pre-select** everything found. Uncertain matches are marked *possible*; names that may be only part of a name are marked *partial?*.
3. You uncheck false positives, then click **Redact Selected Information**.
4. MuPDF removes the selected text and blanks the image pixels under each box, strips comments, form fields, attachments, bookmarks, links, scripts and metadata, and the file is re-opened and checked by MuPDF and by pdf.js (an independent engine). If any check fails, no file is offered.

## Run it locally
Requires Node.js 20+ (no npm dependencies). Everything the app needs is committed under `public/`.
```sh
npm run serve          # http://127.0.0.1:8788 - static server that applies public/_headers like Cloudflare Pages
npm test               # unit, PDF, header and static-content tests (17 tests)
npm run check:vendor   # every vendored file matches its pinned SHA-256
node tools/fetch-vendor.mjs --hashes-only   # ...and matches the hash published by the upstream package (network)
npm run check:size     # Cloudflare Pages limits (25 MiB per file)
```
Any static file server works for development, but only `tools/serve.mjs` reproduces the production response headers. Browser self-test: `node tools/serve.mjs --test` then open `http://127.0.0.1:8788/__tests/selftest.html?id=mybrowser`; the report lands in `tests/out/`.

## Layout
- `public/` - the deployable static site (`index.html`, `about.html`, `css/`, `js/`, `vendor/`, `licenses/`, `_headers`). No build step.
- `public/js/` - our code: `app.js` (UI), `worker.js` (PDF worker), `core.js` (redaction, sanitising, verification), `detect.js`, `names_nlp.js`, `partial.js`, `ocr.js`, `extract.js`, `verify_pdfjs.js`.
- `public/vendor/` - unmodified third-party builds, pinned in `tools/vendor-sources.json` (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
- `tests/` - Node tests, synthetic fixtures (all data fictional), browser self-test. `tools/` - server, header/vendor/size checks.
- `docs/` - [deployment](docs/DEPLOYMENT.md), [security review](docs/SECURITY-REVIEW.md), [limits](docs/LIMITS.md), [test results](docs/TEST-RESULTS.md), [NeonHarbor Labs integration](docs/NEON-HARBOR-INTEGRATION.md).

## Limits (conservative, from measured memory use)
50 MB / 100 pages per PDF. Pages that need OCR: 20 pages and 25 MB. Details and measurements: [docs/LIMITS.md](docs/LIMITS.md). Needs a current browser with WebAssembly SIMD for OCR (Chrome, Edge, Firefox, Safari); without it OCR pages are not read and you are told so.

## License
Copyright (C) 2026 Juleus Chapman. Redact Local is free software under the **GNU Affero General Public License v3.0 or later** ([LICENSE](LICENSE)). Because it embeds MuPDF.js (AGPL-3.0-or-later), the whole combined work is distributed under the AGPL: if you modify it and offer it to others over a network you must offer them the modified source. Third-party components and their licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `public/licenses/`.
Corresponding source for the MuPDF engine: MuPDF 1.28.1, https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz (git tag 1.28.1 at https://cgit.ghostscript.com/mupdf.git; WebAssembly build scripts in platform/wasm). License texts of the libraries inside it: public/licenses/mupdf-third-party-licenses.txt.

## Security
See [SECURITY.md](SECURITY.md) to report a vulnerability.
