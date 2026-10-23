// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Browser-only OCR for scanned pages (Tesseract.js, vendored in ./vendor/ocr). Nothing leaves the page: worker, wasm core and language data are local files.
// Produces detections whose boxes are in PDF points (display space), ready for the existing MuPDF pixel redaction.
import { detectDocument } from './detect.js';
import { annotatePartial } from './partial.js';

export const OCR_DPI = 300, OCR_SCALE = OCR_DPI / 72;
let scriptP = null, workerP = null;
const loadScript = (src) => (scriptP ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }));

// Officially supported loader setup: corePath is a DIRECTORY and Tesseract.js picks relaxed-SIMD, SIMD or plain core itself. Vendored here: the relaxed-SIMD and SIMD LSTM cores of tesseract.js-core 7.0.0
// (the plain, non-SIMD core is not bundled: browsers without WebAssembly SIMD get a clear 'OCR unavailable' message).
let workerOverride = null;   // tests only
export const setWorkerPathForTests = (p) => { workerOverride = p; };
const VENDOR = (p) => new URL('../vendor/tesseract/' + p, import.meta.url).href;
const WORKER_PATH = () => workerOverride || VENDOR('worker.min.js');
export async function getOcrWorker(onProgress) {
  await loadScript(VENDOR('tesseract.min.js'));
  if (!workerP) workerP = window.Tesseract.createWorker('eng', 1, {
    workerPath: WORKER_PATH(), corePath: VENDOR('core'), langPath: VENDOR('').replace(/\/$/, ''),   // all local files
    workerBlobURL: false, cacheMethod: 'none', gzip: true, logger: (m) => onProgress && onProgress(m),
  }).catch((e) => { workerP = null; throw new Error(/importScripts|tesseract-core|wasm/i.test(String(e && e.message)) ? 'OCR is not available in this browser (it needs WebAssembly SIMD support)' : String(e && e.message || e)); });
  return workerP;
}
export async function stopOcr() { if (workerP) { const w = await workerP; workerP = null; await w.terminate(); } }

// image: Blob | HTMLCanvasElement ... -> words in image pixels [{text, conf, x0, y0, x1, y1, line}]
export async function recognizeWords(image, onProgress) {
  const w = await getOcrWorker(onProgress);
  const res = await w.recognize(image, {}, { blocks: true });
  const words = []; let line = 0;
  for (const b of res.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    for (const wd of l.words || []) { const t = (wd.text || '').trim(); if (t) words.push({ text: t, conf: wd.confidence, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, line }); }
    line++;
  }
  return words;
}

// OCR words (pixels) -> a page the detector can read: text with line breaks, per-character rectangles in PDF points, and word records.
export function ocrPage(words, scale = OCR_SCALE) {
  let text = ''; const recs = [], rects = []; let prevLine = -1;
  for (const w of words) {
    if (text) { const sep = w.line !== prevLine ? '\n' : ' '; text += sep; rects.push(null); }
    prevLine = w.line;
    const r = { s: text.length, e: text.length + w.text.length, x0: w.x0 / scale, y0: w.y0 / scale, x1: w.x1 / scale, y1: w.y1 / scale, conf: w.conf, text: w.text }; recs.push(r);
    const cw = (r.x1 - r.x0) / w.text.length;
    for (let i = 0; i < w.text.length; i++) { text += w.text[i]; rects.push([r.x0 + i * cw, r.y0, r.x0 + (i + 1) * cw, r.y1]); }
  }
  const arr = new Float32Array(rects.length * 4);
  rects.forEach((r, i) => { if (r) arr.set(r, 4 * i); else arr.fill(NaN, 4 * i, 4 * i + 4); });
  return { text, rects: arr, words: recs };
}

// A box over part of a word must cover the whole word (and a little margin): OCR boxes are approximate and pixels are what we remove.
export function snapToWords(det, page) {
  const PAD = 2;
  det.rects = det.rects.map((r) => {
    let [x0, y0, x1, y1] = r;
    for (const w of page.words) {
      const vo = Math.min(y1, w.y1) - Math.max(y0, w.y0), hh = w.y1 - w.y0;
      if (Math.min(x1, w.x1) > Math.max(x0, w.x0) && vo > 0.4 * hh) { x0 = Math.min(x0, w.x0); x1 = Math.max(x1, w.x1); y0 = Math.min(y0, w.y0); y1 = Math.max(y1, w.y1); }
    }
    return [x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD];
  });
  return det;
}

// pages: [{pageIndex, words}] -> detections for those pages (selected-by-default is the UI's choice, not made here)
export async function detectOcrPages(pages, firstId, opts = {}) {
  const ocrPages = pages.map((p) => ocrPage(p.words));
  const dets = detectDocument(ocrPages).map((d) => ({ ...d, page: pages[d.page].pageIndex, _op: d.page }));
  let nlpDets = [];
  if (opts.nlp) {
    const { addNlpNames } = await import('./names_nlp.js');
    const idx = dets.map((d) => ({ ...d, page: d._op }));
    nlpDets = addNlpNames(opts.nlp, ocrPages, idx, dets.length).map((d) => ({ ...d, _op: d.page, page: pages[d.page].pageIndex }));
  }
  const all = [...dets, ...nlpDets];
  all.forEach((d, i) => {
    d.id = firstId + i; d.ocr = true;
    const page = ocrPages[d._op]; snapToWords(d, page);
    const ws = page.words.filter((w) => w.s < d.end && d.start < w.e), conf = ws.length ? Math.round(ws.reduce((a, w) => a + w.conf, 0) / ws.length) : null;
    d.ocrConf = conf;
    if (conf != null && conf < 75 && d.confidence === 'high') { d.confidence = 'possible'; d.reason += ' (read by OCR with low confidence ' + conf + '%)'; }
    else d.reason += ' (read by OCR' + (conf != null ? ', confidence ' + conf + '%' : '') + ')';
    delete d._op;
  });
  // partial-name flags use OCR text per page
  const byPage = new Map(pages.map((p, i) => [p.pageIndex, ocrPages[i]]));
  const proxy = new Proxy({}, { get: (_, k) => byPage.get(+k) }); annotatePartial(all, proxy, all);
  return all;
}

// Mixed pages (selectable text + images): keep only OCR words that sit on an image and are NOT already readable as text, so nothing is detected twice.
export function filterImageWords(words, textBoxes, imageBoxes, scale = OCR_SCALE) {
  return words.filter((w) => {
    const x0 = w.x0 / scale, y0 = w.y0 / scale, x1 = w.x1 / scale, y1 = w.y1 / scale, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, area = Math.max(1e-6, (x1 - x0) * (y1 - y0));
    if (!imageBoxes.some((b) => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3])) return false;
    let covered = 0;
    for (const t of textBoxes) { const ox = Math.min(x1, t[2]) - Math.max(x0, t[0]), oy = Math.min(y1, t[3]) - Math.max(y0, t[1]); if (ox > 0 && oy > 0) covered += ox * oy; }
    return covered / area < 0.4;
  });
}

// OCR needs Workers and WebAssembly SIMD (same probe bytes as wasm-feature-detect). Checked up front so the user is warned before anything is attempted.
export function ocrSupport() {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return { ok: false, reason: 'this browser has no Web Worker / WebAssembly support' };
  try { if (!WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))) return { ok: false, reason: 'this browser does not support WebAssembly SIMD (use a current Chrome, Edge, Firefox or Safari)' }; } catch (_) { return { ok: false, reason: 'WebAssembly SIMD check failed' }; }
  return { ok: true };
}
