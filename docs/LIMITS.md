# Limits and measurements
Measured on one Apple-silicon Mac (Chrome 152 / Safari 27), synthetic documents.

| Case | Measurement |
|---|---|
| 300-page text PDF, one term on every page | ~1.2 s, engine memory 95 MB |
| 82 MB image PDF, a box on every photo | 34 s, ~1 GB engine memory, output 173 MB (images are re-saved losslessly under each box) |
| 10 noisy 200-dpi scanned pages (3.2 MB) | OCR 51 s + redact/verify 47 s; browser memory (page + both workers) 9 MB idle -> 446 MB after OCR -> 509 MB after redaction; output 17.4 MB |
| OCR per page | ~5 s end to end in Chrome, ~1-2 s in Safari on the same test |

## Enforced limits
- Any PDF: **50 MB, 100 pages** (`public/js/core.js`, `limits`).
- Pages that need OCR (image-only pages, or pages with an image covering >= 2% of the page): **20 pages and 25 MB** (`public/js/worker.js`). Larger files are refused with a message asking the user to split them.
- Not tested: phones/tablets, very large OCR jobs, Firefox. Expect less memory headroom on phones: the UI is desktop-first.
Raise limits only after testing the memory figure for the new size on a mid-range device.
