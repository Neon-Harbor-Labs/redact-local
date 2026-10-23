// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Independent verifier: pdf.js (a separate JavaScript PDF engine) re-checks a MuPDF.js export. Runs in the page, no network.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
// pdf.js schedules rendering with requestAnimationFrame, which browsers pause in background tabs: verification would hang.
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);   // verification must not depend on tab visibility
const compact = (s) => s.replace(/\s+/g, '').toLowerCase();
const nonEmpty = (v) => v && (Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).length : true);

const call = async (doc, name, facts) => { if (typeof doc[name] !== 'function') { (facts.unavailable ||= []).push(name); return null; } return doc[name](); };

const countIn = (hay, needle) => { let n = 0, i = 0; if (!needle) return 0; while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; };

export async function verifyWithPdfjs(bytes, { terms = [], boxes = [], keep = [], expectMax = [] } = {}) {
  const t0 = performance.now(), problems = [], facts = {};
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    facts.pages = doc.numPages;
    let all = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      all += (await page.getTextContent()).items.map((it) => it.str).join(' ') + '\n';
      const ann = await page.getAnnotations();
      if (ann.length) problems.push('annotations/links/fields on page ' + i + ' (' + ann.length + ')');
    }
    for (const t of terms) if (compact(all).includes(compact(t))) problems.push("'" + t + "' still extractable (pdf.js text)");
    const ca = compact(all);
    facts.remaining = [];
    for (const e of expectMax) { const n = countIn(ca, compact(e.text)); facts.remaining.push({ text: e.text, found: n, allowed: e.max }); if (n > e.max) problems.push('"' + e.text + '" appears ' + n + ' time(s) in the export; at most ' + e.max + ' expected (pdf.js text)'); }
    facts.keep = Object.fromEntries(keep.map((k) => [k, compact(all).includes(compact(k))]));
    if (nonEmpty(await call(doc, 'getAttachments', facts))) problems.push('attachments present');
    if (nonEmpty(await call(doc, 'getOutline', facts))) problems.push('bookmarks present');
    if (nonEmpty(await call(doc, 'getJSActions', facts)) || nonEmpty(await call(doc, 'getJavaScript', facts))) problems.push('JavaScript present');
    if (nonEmpty(await call(doc, 'getFieldObjects', facts))) problems.push('form fields present');
    if (nonEmpty(await call(doc, 'getOpenAction', facts))) problems.push('open action present (may run JavaScript)');
    const md = await doc.getMetadata();
    const bad = ['Title', 'Author', 'Subject', 'Keywords', 'Creator'].filter((k) => md.info && md.info[k]);
    if (bad.length) problems.push('document info present: ' + bad.join(','));
    if (md.metadata) problems.push('XMP metadata present');
    const cfg = await call(doc, 'getOptionalContentConfig', facts);
    if (cfg && typeof cfg.getGroups === 'function' && nonEmpty(cfg.getGroups())) problems.push('optional-content layers present');
    for (const b of boxes) {
      const page = await doc.getPage(b.page + 1), vp = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const r = b.rect, x0 = Math.ceil(r[0] + 1), y0 = Math.ceil(r[1] + 1), x1 = Math.floor(r[2] - 1), y1 = Math.floor(r[3] - 1);
      const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data; let max = 0;
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
      if (max > 24) problems.push('box on page ' + (b.page + 1) + ' not black in pdf.js render (max channel ' + max + ')');
    }
  } finally { await task.destroy(); }
  return { ok: !problems.length, problems, facts, ms: Math.round(performance.now() - t0) };
}

// Render pages of a PDF with pdf.js (independent of MuPDF) into canvases at the given scale; calls cb(canvas, pageIndex) for each requested page.
export async function renderWithPdfjs(bytes, pageIndexes, scale, cb) {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }); const doc = await task.promise;
  try { for (const i of pageIndexes) { const page = await doc.getPage(i + 1), vp = page.getViewport({ scale }); const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); await page.render({ canvasContext: ctx, viewport: vp }).promise; await cb(c, i); } }
  finally { await task.destroy(); }
}
