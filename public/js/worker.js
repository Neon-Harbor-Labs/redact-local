// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Redact Local - PDF worker (AGPL-3.0-or-later)
// Automatic-redaction worker: open -> bake -> extract text with positions -> detect. Renders pages, runs redaction + verification.
// Everything stays in this worker; no network.
import * as mupdf from '../vendor/mupdf/mupdf.js';
import * as core from './core.js';
import { detectDocument } from './detect.js';
import { extractPage } from './extract.js';
import { loadNlp, addNlpNames } from './names_nlp.js';
import { annotatePartial } from './partial.js';

let bytes = null, doc = null, pagesCache = null, detCache = null;
const t = () => performance.now();
const BIG_IMAGE = 0.02;   // an image covering >= 2% of the page is treated as possible text content
function wordBoxes(ex) {   // text-layer words as [x0,y0,x1,y1] (display points)
  const out = []; let s = -1; const T = ex.text, A = ex.rects;
  const flush = (e) => { if (s < 0) return; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = s; i < e; i++) { if (Number.isNaN(A[4 * i])) continue; x0 = Math.min(x0, A[4 * i]); y0 = Math.min(y0, A[4 * i + 1]); x1 = Math.max(x1, A[4 * i + 2]); y1 = Math.max(y1, A[4 * i + 3]); } if (x1 > x0) out.push([x0, y0, x1, y1]); s = -1; };
  for (let i = 0; i < T.length; i++) { if (/\s/.test(T[i])) flush(i); else if (s < 0) s = i; }
  flush(T.length); return out;
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'open') {
      const t0 = t();
      if (doc) { try { doc.destroy(); } catch (_) {} }
      bytes = new Uint8Array(m.pdf);
      doc = core.openPdf(mupdf, bytes);       // rejects encrypted / layered / XFA / corrupt files with a clear message
      const inventory = core.inventory(doc);
      core.prepare(doc);                      // flatten annotations + field values so their text can be found and redacted
      const pages = [], sizes = [], scanned = [], mixed = [];
      for (let i = 0; i < doc.countPages(); i++) {
        const p = doc.loadPage(i), b = p.getBounds(); sizes.push({ w: b[2] - b[0], h: b[3] - b[1] });
        const ex = extractPage(p); pages.push(ex);
        let imgs = []; try { imgs = JSON.parse(p.toStructuredText('preserve-images').asJSON()).blocks.filter((x) => x.type === 'image').map((x) => [x.bbox.x, x.bbox.y, x.bbox.x + x.bbox.w, x.bbox.y + x.bbox.h]); } catch (_) {}
        const big = imgs.filter((b) => (b[2] - b[0]) * (b[3] - b[1]) >= BIG_IMAGE * (b[2] > 0 ? (sizes[i].w * sizes[i].h) : 1));
        const hasText = ex.text.replace(/\s+/g, '').length >= 15;
        if (!hasText && imgs.length) scanned.push(i + 1);
        else if (hasText && big.length) mixed.push({ page: i, images: big, textBoxes: wordBoxes(ex) });
      }
      const ocrCount = scanned.length + mixed.length;
      if (ocrCount > core.limits.ocrPages) throw new core.PdfError('This PDF has ' + ocrCount + ' pages that need OCR (scanned pages, or pages with large images). The limit is ' + core.limits.ocrPages + ' pages so that your browser does not run out of memory. Split the PDF into smaller parts and try again.');
      if (ocrCount && bytes.length > core.limits.ocrBytes) throw new core.PdfError('This PDF needs OCR and is larger than ' + Math.round(core.limits.ocrBytes / 1048576) + ' MB, which is the limit for scanned pages. Split the PDF or reduce its image size and try again.');
      const t1 = t();
      const detections = detectDocument(pages); pagesCache = pages; detCache = detections; annotatePartial(detections, pages);
      postMessage({ type: 'opened', sizes, scanned, mixed, inventory, detections, fullCompact: pages.map((p) => p.text.replace(/\s+/g, '').toLowerCase()).join('|'),
        timings: { open_extract_ms: Math.round(t1 - t0), detect_ms: Math.round(t() - t1) } });
      // phase 2 (optional): language-analysis name suggestions, loaded only now so the first results are not delayed. POSSIBLE only.
      const my = pagesCache;
      try { const t2 = t(); const nlp = await loadNlp(); if (my !== pagesCache) return; const extra = addNlpNames(nlp, pages, detections, detections.length); annotatePartial(extra, pages, detections.concat(extra)); annotatePartial(detections, pages, detections.concat(extra)); const refreshed = detections.filter((d) => d.category === 'name').map((d) => ({ id: d.id, partial: d.partial })); postMessage({ type: 'names_added', detections: extra, refreshed, ms: Math.round(t() - t2) }); }
      catch (err) { postMessage({ type: 'names_failed', message: String(err && err.message || err) }); }
    } else if (m.type === 'render') {
      const px = doc.loadPage(m.page).toPixmap(mupdf.Matrix.scale(m.scale, m.scale), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = px.asPNG().slice(); postMessage({ type: 'rendered', page: m.page, png }, [png.buffer]);
    } else if (m.type === 'pixelcheck') {
      // Test aid: read the STORED image pixels (not a rendering) inside each box and report how much dark ink is left.
      const d2 = core.openPdf(mupdf, new Uint8Array(m.pdf), true), res = [];
      for (const pno of [...new Set(m.boxes.map((b) => b.page))]) {
        const imgs = []; d2.loadPage(pno).toStructuredText('preserve-images').walk({ onImageBlock(bbox, tr, image) { imgs.push({ bbox, image }); } });
        for (const b of m.boxes.filter((x) => x.page === pno)) {
          const r = b.rect, im = imgs.find((x) => r[0] >= x.bbox[0] - 1 && r[2] <= x.bbox[2] + 1 && r[1] >= x.bbox[1] - 1 && r[3] <= x.bbox[3] + 1); if (!im) continue;
          const px = im.image.toPixmap(), W = px.getWidth(), H = px.getHeight(), n = px.getNumberOfComponents(), data = px.getPixels(), bw = im.bbox[2] - im.bbox[0], bh = im.bbox[3] - im.bbox[1];
          const X0 = Math.max(0, Math.floor((r[0] - im.bbox[0]) / bw * W)), X1 = Math.min(W, Math.ceil((r[2] - im.bbox[0]) / bw * W)), Y0 = Math.max(0, Math.floor((r[1] - im.bbox[1]) / bh * H)), Y1 = Math.min(H, Math.ceil((r[3] - im.bbox[1]) / bh * H));
          let dark = 0, tot = 0; for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { let v = 0; for (let c = 0; c < Math.min(n, 3); c++) v += data[(y * W + x) * n + c]; v /= Math.min(n, 3); tot++; if (v < 160) dark++; }
          res.push({ page: pno, dark, total: tot });
        }
      }
      postMessage({ type: 'pixelchecked', res });
    } else if (m.type === 'redact') {
      const t0 = t();
      try {
        const { out, report } = core.redact(mupdf, bytes, m.boxes, []);
        report.ms = Math.round(t() - t0);
        postMessage({ type: 'redacted', ok: true, out, report }, [out.buffer]);
      } catch (err) {
        postMessage({ type: 'redacted', ok: false, kind: err instanceof core.RedactionFailed ? 'failed' : 'rejected', message: String(err.message || err), report: err.report || null });
      }
    }
  } catch (err) {
    postMessage({ type: 'error', op: m.type, message: String(err && err.message || err), rejected: err instanceof core.PdfError });
  }
};
postMessage({ type: 'ready' });
