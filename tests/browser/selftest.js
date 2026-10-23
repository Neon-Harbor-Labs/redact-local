// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Browser self-test: runs the real pipeline (worker, detection, OCR, redaction, pdf.js verification) on synthetic fixtures and POSTs a report to the test server.
import { ocrSupport, recognizeWords, detectOcrPages, filterImageWords, OCR_SCALE, stopOcr } from '/js/ocr.js';
import { verifyWithPdfjs } from '/js/verify_pdfjs.js';
import { loadNlp } from '/js/names_nlp.js';
const id = new URL(location.href).searchParams.get('id') || 'browser', out = { id, userAgent: navigator.userAgent, steps: {}, violations: [], errors: [] };
document.addEventListener('securitypolicyviolation', (e) => out.violations.push(e.violatedDirective + ' ' + e.blockedURI));
addEventListener('error', (e) => out.errors.push(String(e.message))); addEventListener('unhandledrejection', (e) => out.errors.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
const step = async (name, fn) => { const t = performance.now(); try { out.steps[name] = Object.assign({ ok: true }, await fn()); } catch (e) { out.steps[name] = { ok: false, error: String(e && e.message || e) }; } out.steps[name].ms = Math.round(performance.now() - t); };
const fetchPdf = async (n) => await (await fetch('/__fixtures/pdf/' + n)).arrayBuffer();
let worker, waiting = null; const readyP = new Promise((res) => { worker = new Worker('/js/worker.js', { type: 'module' }); worker.onmessage = (e) => { if (e.data.type === 'ready') return res(); if (['names_added', 'names_failed'].includes(e.data.type)) return; const w = waiting; waiting = null; e.data.type === 'error' ? w.reject(new Error(e.data.message)) : w.resolve(e.data); }; });
const ask = (m, t = []) => new Promise((res, rej) => { waiting = { resolve: res, reject: rej }; worker.postMessage(m, t); });
await readyP; out.ocrSupport = ocrSupport(); out.crossOriginIsolated = self.crossOriginIsolated;
const nlp = await loadNlp().catch(() => null);
async function pipeline(file, { useOcr }) {
  const buf = await fetchPdf(file), o = await ask({ type: 'open', pdf: buf }, [buf]); let dets = o.detections.map((d) => ({ ...d })); let ocrCount = 0;
  if (useOcr && (o.scanned.length || o.mixed.length)) {
    const jobs = [...o.scanned.map((p) => ({ i: p - 1 })), ...o.mixed.map((m) => ({ i: m.page, m }))], pages = [];
    for (const { i, m } of jobs) { const r = await ask({ type: 'render', page: i, scale: OCR_SCALE }); let words = await recognizeWords(new Blob([r.png], { type: 'image/png' })); if (m) words = filterImageWords(words, m.textBoxes, m.images); pages.push({ pageIndex: i, words }); }
    const found = await detectOcrPages(pages, 50000, { nlp }); ocrCount = found.length; dets = dets.concat(found);
  }
  const boxes = dets.flatMap((d) => d.rects.map((r) => ({ page: d.page, rect: r }))); if (!boxes.length) return { detections: dets.length, note: 'nothing to redact' };
  const red = await ask({ type: 'redact', boxes }); if (!red.ok) throw new Error('redaction refused: ' + red.message);
  const v = await verifyWithPdfjs(red.out, { boxes }); if (!v.ok) throw new Error('pdf.js verification failed: ' + v.problems.join('; '));
  return { pages: o.sizes.length, scannedPages: o.scanned.length, mixedPages: o.mixed.length, detections: dets.length, fromOcr: ocrCount, boxes: boxes.length, verifiedByMuPDF: red.report.verified, verifiedByPdfjs: v.ok, outBytes: red.out.length };
}
await step('text_pdf', () => pipeline('auto_D1_discharge_letter.pdf', { useOcr: false }));
await step('form_pdf', () => pipeline('form_application.pdf', { useOcr: false }));
if (out.ocrSupport.ok) { await step('scanned_pdf_ocr', () => pipeline('scan_D1_clean300.pdf', { useOcr: true })); await step('mixed_pdf_ocr', () => pipeline('mixed_text_plus_scan.pdf', { useOcr: true })); }
else { out.steps.scanned_pdf_ocr = { ok: true, skipped: 'OCR unsupported here: ' + out.ocrSupport.reason + ' (the app shows a warning and does not read scanned pages)' }; }
for (const n of ['garbage.pdf', 'truncated.pdf', 'encrypted.pdf', 'hidden_layer.pdf', 'xfa_form.pdf']) await step('rejects_' + n, async () => { const buf = await fetchPdf(n); try { await ask({ type: 'open', pdf: buf }, [buf]); } catch (e) { return { rejectedWith: e.message.slice(0, 80) }; } throw new Error('was NOT rejected'); });
await step('rejects_21_scanned_pages', async () => { const buf = await fetchPdf('scan_21_pages.pdf'); try { await ask({ type: 'open', pdf: buf }, [buf]); } catch (e) { if (!/limit is 20 pages/.test(e.message)) throw new Error('wrong message: ' + e.message); return { rejectedWith: e.message.slice(0, 80) }; } throw new Error('was NOT rejected'); });
try { await stopOcr(); } catch (_) {}
out.externalResources = performance.getEntriesByType('resource').filter((r) => new URL(r.name).origin !== location.origin).map((r) => r.name);
out.allOk = Object.values(out.steps).every((s) => s.ok) && !out.violations.length && !out.externalResources.length;
await fetch('/__report?id=' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(out, null, 1) }); document.getElementById('o').textContent = JSON.stringify(out, null, 1); window.__selftest = out;
