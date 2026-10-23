// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Redaction engine, sanitisation and fail-safe behaviour on synthetic PDFs. Run: npm test
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import * as mupdf from '../public/vendor/mupdf/mupdf.js'; import * as core from '../public/js/core.js';
const pdf = (n) => new Uint8Array(fs.readFileSync(new URL('./fixtures/pdf/' + n + '.pdf', import.meta.url)));
const text = (bytes) => { const d = core.openPdf(mupdf, bytes, true); return core.pageTexts(d).join('\n'); };
test('malformed and unsupported PDFs are rejected with a clear message and never produce output', () => {
  for (const [name, re] of [['garbage', /not a PDF/i], ['truncated', /could not be opened|corrupt/i], ['encrypted', /password|encrypted/i], ['hidden_layer', /layer/i], ['xfa_form', /XFA/i]]) {
    assert.throws(() => core.redact(mupdf, pdf(name), [], ['000-12-3456']), (e) => e instanceof core.PdfError && re.test(e.message), name);
  }
  assert.throws(() => core.openPdf(mupdf, new Uint8Array(0)), core.PdfError);
  assert.throws(() => core.openPdf(mupdf, new TextEncoder().encode('%PDF-1.7 definitely not a pdf')), core.PdfError);
});
test('size and page limits are enforced', () => {
  const saved = { ...core.limits }; core.limits.maxBytes = 1000; assert.throws(() => core.openPdf(mupdf, pdf('multipage')), /larger than/); core.limits.maxBytes = saved.maxBytes;
  core.limits.maxPages = 2; assert.throws(() => core.openPdf(mupdf, pdf('multipage')), /more than 2 pages/); core.limits.maxPages = saved.maxPages;
});
test('text redaction removes every occurrence (incl. rotated page) and keeps unrelated text', () => {
  const { out, report } = core.redact(mupdf, pdf('multipage'), [], ['000-12-3456']);
  assert(report.verified && report.terms[0].matches === 3); const t = text(out);
  assert(!t.replace(/\s/g, '').includes('000-12-3456')); assert(t.includes('Quarterly plan review')); assert(t.includes('Page three keeps this text'));
});
test('forms: field values are flattened then redacted; comments, attachments, bookmarks, metadata are stripped', () => {
  const { out, report } = core.redact(mupdf, pdf('form_application'), [], ['000-12-3456']);
  assert(report.verified && report.removed.attachments === 1 && report.removed.annotations >= 1);
  const d = core.openPdf(mupdf, out, true); assert.equal(Object.keys(d.getEmbeddedFiles()).length, 0); assert.equal(d.getTrailer().get('Info').isNull(), true);
  const t = text(out); assert(!t.includes('000-12-3456')); assert(t.includes('Eligibility review'));
});
test('box over an image: stored image pixels are blanked (not just covered)', () => {
  const box = { page: 1, rect: [72 + 40, 200 + 30, 72 + 120, 200 + 110] }, { out } = core.redact(mupdf, pdf('report_with_images'), [box], []);
  const d = core.openPdf(mupdf, out, true); const imgs = []; d.loadPage(1).toStructuredText('preserve-images').walk({ onImageBlock(b, t, image) { imgs.push({ b, image }); } });
  const photo = imgs.find((x) => x.image.getWidth() === 240), px = photo.image.toPixmap(), n = px.getNumberOfComponents(), data = px.getPixels(); const at = (x, y) => [...data.slice((y * 240 + x) * n, (y * 240 + x) * n + 3)];
  assert.deepEqual(at(80, 70), [255, 255, 255]);          // the face block was (230,180,150) in the original image
  assert.notDeepEqual(at(190, 40), [255, 255, 255]);       // an untouched part of the photo is still there
});
test('a broken redaction engine fails closed: no output is released', () => {
  const real = mupdf.PDFPage.prototype.applyRedactions; mupdf.PDFPage.prototype.applyRedactions = function () {};
  try { assert.throws(() => core.redact(mupdf, pdf('multipage'), [], ['000-12-3456']), (e) => e instanceof core.RedactionFailed && /FAILED/.test(e.message)); } finally { mupdf.PDFPage.prototype.applyRedactions = real; }
});
test('nothing selected / nothing matched is an error, not an empty "safe" file', () => { assert.throws(() => core.redact(mupdf, pdf('multipage'), [], ['no-such-text-xyz']), /Nothing to redact/); });
