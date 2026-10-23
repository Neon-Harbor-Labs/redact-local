// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Gate 2: browser port of pdf_core.py (sanitize + deep verification) on MuPDF.js. ES module, no DOM, no network.
export class PdfError extends Error {}
export class RedactionFailed extends PdfError { constructor(m, report) { super(m); this.report = report || {}; } }

// Conservative limits from measured memory use (see docs/LIMITS.md): 50 MB / 100 pages for any PDF; stricter OCR limits are enforced in worker.js.
export const limits = { maxBytes: 50 * 1024 * 1024, maxPages: 100, ocrPages: 20, ocrBytes: 25 * 1024 * 1024 };
const PURGE_KEYS = ['Metadata', 'Thumb', 'PieceInfo', 'AA', 'OpenAction', 'JS', 'JavaScript', 'Names', 'Dests', 'AcroForm',
  'Outlines', 'StructTreeRoot', 'Threads', 'URI', 'OCProperties', 'Annots', 'Collection'];
const SCAN_TOKENS = [...PURGE_KEYS, 'Launch', 'EmbeddedFile', 'EmbeddedFiles', 'XFA', 'RichMedia', 'SubmitForm', 'ImportData'];
const SCAN_RE = new RegExp('/(' + SCAN_TOKENS.join('|') + ')(?![A-Za-z0-9])');
const compact = (s) => s.replace(/\s+/g, '').toLowerCase();
const rectOfQuad = (q) => [Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])];
const union = (rs) => [Math.min(...rs.map(r => r[0])), Math.min(...rs.map(r => r[1])), Math.max(...rs.map(r => r[2])), Math.max(...rs.map(r => r[3]))];
const inter = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export function openPdf(mupdf, bytes, internal = false) {   // internal: re-opening our own export; size/page caps apply to user input only
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw new PdfError('The file is empty.');
  if (!internal && bytes.length > limits.maxBytes) throw new PdfError('PDF is larger than ' + Math.round(limits.maxBytes / 1048576) + ' MB.');
  if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new PdfError('This is not a PDF file (missing %PDF header).');
  let doc;
  try { doc = mupdf.Document.openDocument(bytes.slice(), 'application/pdf'); }
  catch (e) { throw new PdfError('This PDF could not be opened. It may be corrupt or truncated.'); }
  try {
    if (!(doc instanceof mupdf.PDFDocument)) throw new PdfError('Not a PDF document.');
    if (doc.needsPassword() || !doc.getTrailer().get('Encrypt').isNull()) throw new PdfError('Password-protected / encrypted PDFs are not supported. Remove the password first.');
    const n = doc.countPages();
    if (n < 1) throw new PdfError('This PDF has no pages.');
    if (!internal && n > limits.maxPages) throw new PdfError('PDF has more than ' + limits.maxPages + ' pages.');
    doc.loadPage(0);
    rejectUnsanitizable(doc);
  } catch (e) {
    try { doc.destroy && doc.destroy(); } catch (_) {}
    if (e instanceof PdfError) throw e;
    throw new PdfError('This PDF could not be read. It may be corrupt.');
  }
  return doc;
}

function rejectUnsanitizable(doc) {
  if (doc.countLayers() > 0) throw new PdfError('This PDF has optional-content layers (hidden/visible layers). Hidden layers can hold text that cannot be reliably checked, so it is rejected. Flatten/print the PDF to a new file first.');
  const root = doc.getTrailer().get('Root');
  const acro = root.get('AcroForm');
  if (!acro.isNull() && !acro.get('XFA').isNull()) throw new PdfError('This PDF uses XFA dynamic forms, whose data cannot be reliably cleaned. Print it to a new PDF first.');
  if (!root.get('Collection').isNull()) throw new PdfError('PDF portfolios (collections of attached files) are not supported.');
}

function countOutline(items) { let n = 0; for (const it of items || []) { n += 1 + countOutline(it.down); } return n; }

export function inventory(doc) {
  let annots = 0, links = 0, widgets = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    const p = doc.loadPage(i);
    for (const a of p.getAnnotations()) { const t = a.getType(); if (t !== 'Redact' && t !== 'Widget' && t !== 'Link') annots++; }
    links += p.getLinks().length; widgets += p.getWidgets().length;
  }
  const root = doc.getTrailer().get('Root');
  const meta = ['Title', 'Author', 'Subject', 'Keywords'].some((k) => doc.getMetaData('info:' + k)) || !root.get('Metadata').isNull();
  return { annotations: annots, links, form_fields: widgets, attachments: Object.keys(doc.getEmbeddedFiles()).length,
    bookmarks: countOutline(doc.loadOutline()), metadata: meta, tags: !root.get('StructTreeRoot').isNull() };
}

export function prepare(doc) { doc.bake(true, true); }   // flatten visible annotations + field values into page content

export function sanitize(mupdf, doc) {
  for (const name of Object.keys(doc.getEmbeddedFiles())) { try { doc.deleteEmbeddedFile(name); } catch (_) {} }
  for (let i = 0; i < doc.countPages(); i++) {
    const p = doc.loadPage(i);
    for (const a of p.getAnnotations()) p.deleteAnnotation(a);
    for (const w of p.getWidgets()) p.deleteAnnotation(w);
    for (const l of p.getLinks()) p.deleteLink(l);
    p.getObject().delete('Annots');
  }
  const trailer = doc.getTrailer(), root = trailer.get('Root');
  for (const k of PURGE_KEYS) if (!root.get(k).isNull()) root.delete(k);
  if (!trailer.get('Info').isNull()) trailer.delete('Info');
  // IMPORTANT: operate on the indirect reference. Calling .resolve() on a stream object and then saving silently drops the
  // stream data (found in Gate 2: unrelated images lost their pixels). Cross-engine testing caught it.
  const n = doc.countObjects();
  for (let i = 1; i < n; i++) {
    let r; try { r = doc.newIndirect(i); if (!r.isDictionary()) continue; } catch (_) { continue; }
    for (const k of PURGE_KEYS) { if (!r.get(k).isNull()) r.delete(k); }
  }
}

function imageBoxes(page) {
  try {
    const j = JSON.parse(page.toStructuredText('preserve-images').asJSON());
    return (j.blocks || []).filter((b) => b.type === 'image').map((b) => [b.bbox.x, b.bbox.y, b.bbox.x + b.bbox.w, b.bbox.y + b.bbox.h]);
  } catch (_) { return []; }
}

function checkTerm(t) { if (typeof t !== 'string' || t.trim().length < 2) throw new PdfError('Search text must be at least 2 characters.'); return t.trim(); }

export function findTerm(doc, term) {
  term = checkTerm(term);
  const hits = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i), imgs = imageBoxes(page), pb = page.getBounds();
    for (const h of page.search(term)) {
      let r = union(h.map(rectOfQuad));
      if (imgs.some((b) => inter(r, b))) r = [Math.max(pb[0], r[0] - 2), Math.max(pb[1], r[1] - 1.5), Math.min(pb[2], r[2] + 2), Math.min(pb[3], r[3] + 1.5)];
      hits.push({ page: i, rect: r });
    }
  }
  return hits;
}

function charsIn(page, r) {          // text of characters whose centre lies inside r
  const st = page.toStructuredText('preserve-whitespace'), lines = []; let cur = '';
  st.walk({ beginLine() { cur = ''; }, endLine() { if (cur) lines.push(cur); },
    onChar(c, o, f, s, q) { const b = rectOfQuad(q), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; if (cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]) cur += c; } });
  return lines.join(' ').split(/\s+/).filter(Boolean).join(' ');
}

function cleanRect(page, rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((v) => typeof v === 'number' && isFinite(v))) throw new PdfError('Invalid redaction box.');
  const pb = page.getBounds();
  const r = [Math.max(pb[0], Math.min(rect[0], rect[2])), Math.max(pb[1], Math.min(rect[1], rect[3])), Math.min(pb[2], Math.max(rect[0], rect[2])), Math.min(pb[3], Math.max(rect[1], rect[3]))];
  if (r[2] - r[0] < 1 || r[3] - r[1] < 1) throw new PdfError('A redaction box is empty or outside the page.');
  return r;
}

export function pageTexts(doc) { const o = []; for (let i = 0; i < doc.countPages(); i++) o.push(doc.loadPage(i).toStructuredText('preserve-whitespace').asText()); return o; }

export function redact(mupdf, bytes, boxes = [], terms = []) {
  const doc = openPdf(mupdf, bytes);
  let out, plan = new Map(), regions = [], termReport = [], boxTexts = [], inv;
  try {
    inv = inventory(doc);
    prepare(doc);
    terms = terms.map(checkTerm);
    const add = (p, r) => { if (!plan.has(p)) plan.set(p, []); plan.get(p).push(r); };
    for (const b of boxes) {
      if (!b || !Number.isInteger(b.page) || b.page < 0 || b.page >= doc.countPages()) throw new PdfError('A redaction box refers to a page that does not exist.');
      const page = doc.loadPage(b.page), r = cleanRect(page, b.rect);
      add(b.page, r); regions.push({ page: b.page, rect: r });
      const bt = charsIn(page, r); if (bt.length >= 4) boxTexts.push(bt);
    }
    for (const t of terms) { const hs = findTerm(doc, t); hs.forEach((h) => add(h.page, h.rect)); termReport.push({ term: t, matches: hs.length }); }
    if (!plan.size) throw new PdfError('Nothing to redact: no boxes were drawn and no search text matched.');
    for (const [pno, rects] of plan) {
      const page = doc.loadPage(pno);
      for (const r of rects) { const a = page.createAnnotation('Redact'); a.setRect(r); }
      page.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
    }
    sanitize(mupdf, doc);
    out = doc.saveToBuffer('garbage=deduplicate,compress').asUint8Array().slice();
  } catch (e) {
    if (e instanceof PdfError) throw e;
    throw new RedactionFailed('Redaction failed (' + (e && e.name || 'Error') + ': ' + (e && e.message || e) + '). No output was produced.');
  } finally { try { doc.destroy && doc.destroy(); } catch (_) {} }
  const report = verify(mupdf, out, terms, regions, boxTexts);
  Object.assign(report, { terms: termReport, boxes: regions.length, removed: inv, pages_changed: [...plan.keys()].map((p) => p + 1).sort((a, b) => a - b), bytes: out.length });
  return { out, report };
}

function deepCheck(doc) {
  const problems = [], root = doc.getTrailer().get('Root');
  if (Object.keys(doc.getEmbeddedFiles()).length) problems.push('attachments remain');
  if (countOutline(doc.loadOutline())) problems.push('bookmarks remain');
  if (doc.countLayers() > 0) problems.push('optional-content layers remain');
  if (!doc.getTrailer().get('Info').isNull() || !root.get('Metadata').isNull()) problems.push('metadata remains');
  for (let i = 0; i < doc.countPages(); i++) {
    const p = doc.loadPage(i);
    if (p.getAnnotations().length || p.getWidgets().length || p.getLinks().length) { problems.push('annotations/fields/links remain on page ' + (i + 1)); break; }
  }
  const n = doc.countObjects();
  let badStructure = false, badImage = false;
  for (let i = 1; i < n; i++) {
    let r, s; try { r = doc.newIndirect(i); if (!r.isDictionary()) continue; s = r.resolve().toString(); } catch (_) { continue; }
    const m = SCAN_RE.exec(s);
    if (m && !badStructure) { badStructure = true; problems.push('forbidden structure /' + m[1] + ' remains (object ' + i + ')'); }
    if (!badImage && /\/Subtype\s*\/Image\b/.test(s) && !r.isStream()) { badImage = true; problems.push('image data missing in object ' + i + ' (export would be damaged)'); }
  }
  return problems;
}

export function verify(mupdf, out, terms, regions, boxTexts = []) {
  const problems = [], checks = [];
  let v; try { v = openPdf(mupdf, out, true); } catch (e) { throw new RedactionFailed('The exported PDF could not be reopened. Nothing was produced.'); }
  try {
    const texts = pageTexts(v), all = texts.join('\n');
    for (const t of terms) {
      for (let i = 0; i < v.countPages(); i++) if (v.loadPage(i).search(t).length) problems.push("'" + t + "' still found by search on page " + (i + 1));
      if (compact(all).includes(compact(t))) problems.push("'" + t + "' still extractable (MuPDF text)");
    }
    checks.push('MuPDF text extraction + search: ' + terms.length + ' term(s) checked');
    const pxCache = new Map();
    for (const { page: pno, rect } of regions) {
      const page = v.loadPage(pno);
      if (charsIn(page, rect)) problems.push('text remains inside a box on page ' + (pno + 1));
      const inner = (rect[2] - rect[0] > 3 && rect[3] - rect[1] > 3) ? [rect[0] + 1, rect[1] + 1, rect[2] - 1, rect[3] - 1] : rect;
      if (!pxCache.has(pno)) pxCache.set(pno, page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceGray, false, false));
      const px = pxCache.get(pno), pb = px.getBounds(), px0 = pb[0], py0 = pb[1];
      const data = px.getPixels(), stride = px.getStride(), w = px.getWidth(), h = px.getHeight();
      let max = 0;
      for (let y = Math.max(0, Math.floor(inner[1] - py0)); y < Math.min(h, Math.ceil(inner[3] - py0)); y++)
        for (let x = Math.max(0, Math.floor(inner[0] - px0)); x < Math.min(w, Math.ceil(inner[2] - px0)); x++) max = Math.max(max, data[y * stride + x]);
      if (max > 24) problems.push('box on page ' + (pno + 1) + ' is not fully black when rendered');
    }
    if (regions.length) checks.push('Boxes: no characters centred inside, rendered pixels black (' + regions.length + ' box(es))');
    problems.push(...deepCheck(v));
    checks.push('Structure: no attachments, bookmarks, annotations, form fields, links, layers, JavaScript, thumbnails or metadata');
    checks.push('No independent extractor in the browser yet (pdf.js is a Gate 3 candidate): same-engine checks only');
    const hay = compact(all), seen = new Set(), elsewhere = [];
    for (const t of boxTexts) { const c = compact(t); if (c.length >= 4 && hay.includes(c) && !seen.has(c)) { seen.add(c); elsewhere.push(t.slice(0, 60)); } }
    const report = { verified: !problems.length, independent_check: false, checks, problems, still_elsewhere: elsewhere };
    if (problems.length) throw new RedactionFailed('Verification FAILED — no sanitized PDF was produced: ' + problems.join('; '), report);
    return report;
  } finally { try { v.destroy && v.destroy(); } catch (_) {} }
}

// Test-harness helper: search every object dict, decoded stream and the raw file for tokens (plain, UTF-16BE, hex).
export function leakScan(mupdf, bytes, tokens) {
  const lat = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const doc = mupdf.Document.openDocument(bytes.slice(), 'application/pdf');
  const blobs = [lat(bytes)];
  for (let i = 1; i < doc.countObjects(); i++) {
    let o; try { o = doc.newIndirect(i).resolve(); } catch (_) { continue; }
    try { blobs.push(o.toString()); } catch (_) {}
    try { if (o.isStream()) blobs.push(lat(o.readStream().asUint8Array())); } catch (_) {}
  }
  const found = [];
  for (const t of tokens) {
    const u8 = new TextEncoder().encode(t), u16 = new Uint8Array(t.length * 2); for (let i = 0; i < t.length; i++) { u16[2 * i] = t.charCodeAt(i) >> 8; u16[2 * i + 1] = t.charCodeAt(i) & 255; }
    const vars = [t, lat(u16), hex(u16), hex(u16).toUpperCase(), hex(u8), hex(u8).toUpperCase()];
    if (blobs.some((b) => vars.some((v) => b.includes(v)))) found.push(t);
  }
  return found;
}
