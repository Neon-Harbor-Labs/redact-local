// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Scan -> review -> redact -> verify. All processing is in the browser; the PDF never leaves this page.
import { verifyWithPdfjs, renderWithPdfjs } from './verify_pdfjs.js';
import { recognizeWords, detectOcrPages, filterImageWords, OCR_SCALE, stopOcr, ocrSupport } from './ocr.js';
import { loadNlp } from './names_nlp.js';
import { CATEGORIES } from './detect.js';
const $ = (id) => document.getElementById(id);
const SCALE_MAX = 1.2; let SCALE = SCALE_MAX;   // SCALE adapts to the window width (desktop-first, shrinks on narrow screens)
const ORDER = ['ssn', 'card', 'bank', 'govid', 'dob', 'phone', 'email', 'address', 'name', 'manual'];
const LABEL = { ...CATEGORIES, manual: 'Manual boxes' };
const compact = (s) => s.replace(/\s+/g, '').toLowerCase();
const countIn = (h, n) => { let c = 0, i = 0; if (!n) return 0; while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; } return c; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let worker, waiting = null, S = null; const blobUrls = [];
const blobUrl = (blob) => { const u = URL.createObjectURL(blob); blobUrls.push(u); return u; };   // released when the next file is opened
const fmtSize = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(2) + ' MB');
function startWorker() {   // resolves once the worker has loaded (messages sent earlier can be lost)
  if (worker) worker.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let ready; const p = new Promise((r) => (ready = r)); worker.onerror = (e) => { status('Could not start the PDF engine: ' + e.message, true); ready(); };
  worker.onmessage = (e) => { if (e.data.type === 'ready') return ready(); if (e.data.type === 'names_added' || e.data.type === 'names_failed') return namesPhase(e.data); if (waiting) { const w = waiting; waiting = null; e.data.type === 'error' ? w.reject(Object.assign(new Error(e.data.message), { rejected: e.data.rejected })) : w.resolve(e.data); } };
  return p;
}
// Requests to the PDF worker are strictly serialised: a single response slot is shared, so two overlapping requests (e.g. a page preview and the redaction) would swallow each other's answer.
const rawAsk = (msg, transfer = []) => new Promise((resolve, reject) => { waiting = { resolve, reject }; worker.postMessage(msg, transfer); });
let askChain = Promise.resolve();
const ask = (msg, transfer = []) => { const p = askChain.then(() => rawAsk(msg, transfer)); askChain = p.catch(() => {}); return p; };
const status = (t, err) => { const s = $('status'); s.textContent = t || ''; s.style.color = err ? 'var(--red)' : ''; };

$('file').onchange = async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  $('work').hidden = true; $('result').hidden = true; $('result').textContent = ''; blobUrls.splice(0).forEach((u) => URL.revokeObjectURL(u)); S = null;
  if (!/\.pdf$/i.test(f.name)) return status('Please choose a .pdf file.', true);
  status('Scanning for personal information…');
  try {
    await startWorker();
    const buf = await f.arrayBuffer(); const origBytes = buf.byteLength;
    const o = await ask({ type: 'open', pdf: buf }, [buf]);
    S = { origBytes, nameScan: 'pending', name: f.name, sizes: o.sizes, scanned: o.scanned, mixed: o.mixed || [], inventory: o.inventory, fullCompact: o.fullCompact, dets: o.detections.map((d) => ({ ...d, selected: true }))   /* privacy-first: select everything detected */, nextManual: 0, timings: o.timings };
    status(''); $('start').hidden = false; build();
  } catch (err) { status(err.message, true); }
};

function namesPhase(m) {
  if (!S) return;
  if (m.type === 'names_added') { S.dets.push(...m.detections.map((d) => ({ ...d, selected: true }))); (m.refreshed || []).forEach((x) => { const d = S.dets.find((y) => y.id === x.id); if (d) d.partial = x.partial; }); S.nameScan = 'done:' + m.detections.length; renderAll(); }   // selected like everything else; nothing is changed until the user clicks the button
  else { S.nameScan = 'failed'; renderSummary(); }
}

function build() {
  $('work').hidden = false;
  const host = $('pages'); host.textContent = ''; S.pageEls = [];
  const maxW = Math.max(...S.sizes.map((z) => z.w)); SCALE = Math.max(0.45, Math.min(SCALE_MAX, (host.clientWidth - 8) / maxW));
  const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); queueRender(+en.target.dataset.page); } }), { rootMargin: '600px' });
  S.sizes.forEach((sz, i) => {
    const d = el('div', 'page'); d.dataset.page = i; d.style.width = sz.w * SCALE + 'px'; d.style.height = sz.h * SCALE + 'px';
    d.appendChild(el('span', 'pno', 'p. ' + (i + 1))); host.appendChild(d); S.pageEls.push(d); io.observe(d);
    d.addEventListener('mousedown', (ev) => manualDraw(ev, d, i));
  });
  renderAll();
  if (S.scanned.length || S.mixed.length) runOcrPhase();
}
let rq = Promise.resolve();
const task = (fn) => { const p = rq.then(fn); rq = p.catch(() => {}); return p; };   // one request to the PDF worker at a time
function queueRender(i) { task(async () => { const r = await ask({ type: 'render', page: i, scale: SCALE }); const img = document.createElement('img'); img.draggable = false; img.alt = 'Page ' + (i + 1); img.src = blobUrl(new Blob([r.png], { type: 'image/png' })); S.pageEls[i].insertBefore(img, S.pageEls[i].firstChild); }).catch(() => {}); }

// scanned pages: read them with OCR (Tesseract.js, local files only), detect on the OCR text, and redact the image pixels at the OCR word boxes
async function runOcrPhase() {
  const jobs = [...S.scanned.map((p) => ({ i: p - 1, mixed: null })), ...S.mixed.map((m) => ({ i: m.page, mixed: m }))];
  const sup = ocrSupport(); if (!sup.ok) { S.ocr = 'failed:' + sup.reason; renderAll(); return; }
  S.ocr = 'running:0/' + jobs.length; renderSummary(); const pages = [];
  try {
    for (let k = 0; k < jobs.length; k++) {
      const { i, mixed } = jobs[k]; S.ocr = 'running:' + k + '/' + jobs.length; renderSummary();
      const r = await task(() => ask({ type: 'render', page: i, scale: OCR_SCALE }));
      let words = await recognizeWords(new Blob([r.png], { type: 'image/png' }));
      if (mixed) words = filterImageWords(words, mixed.textBoxes, mixed.images);   // only text that is inside images and not already readable as text
      pages.push({ pageIndex: i, words });
    }
    const nlp = await loadNlp().catch(() => null);
    let found = await detectOcrPages(pages, 50000, { nlp });
    const same = (a, b) => { const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return ox > 0 && oy > 0 && ox * oy > 0.5 * Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1])); };
    found = found.filter((d) => !S.dets.some((x) => x.page === d.page && !x.ocr && x.rects.some((r1) => d.rects.some((r2) => same(r1, r2)))));   // never duplicate something already found in the text layer
    S.ocrPages = pages.map((p) => p.pageIndex); S.dets.push(...found.map((d) => ({ ...d, selected: true }))); S.ocr = 'done:' + found.length;
  } catch (err) { S.ocr = 'failed:' + err.message; }
  renderAll();
}

function renderAll() { renderGroups(); renderOverlays(); renderSummary(); }
function selCount() { return S.dets.filter((d) => d.selected).length; }
function renderSummary() {
  const real = S.dets.filter((d) => d.category !== 'manual'), high = real.filter((d) => d.confidence === 'high').length, poss = real.length - high, unchecked = S.dets.filter((d) => !d.selected).length;
  $('summary').textContent = ''; const s = $('summary');
  s.appendChild(el('p', null, 'Found ' + real.length + ' items: ' + high + ' likely, ' + poss + ' possible.'));
  s.appendChild(el('p', 'tiny', S.nameScan === 'pending' ? 'Looking for more names with language analysis…' : S.nameScan === 'failed' ? 'Extra name analysis could not load; only rule-based names were checked.' : 'Language analysis added ' + S.nameScan.split(':')[1] + ' possible name(s). They are selected too; uncheck any that are not people.'));
  const w = $('warnings'); w.textContent = '';
  const st = S.ocr || '', running = st.startsWith('running'), done = st.startsWith('done'), failed = st.startsWith('failed');
  if (S.scanned.length) {
    const d = el('div', 'warn' + (done ? '' : ' bad'));
    if (running) d.append(el('b', null, 'Scanned pages: '), 'page(s) ' + S.scanned.join(', ') + ' are images only, so they are being read with OCR (' + st.split(':')[1] + ' done). This runs on your device and takes a few seconds per page.');
    else if (done) d.append(el('b', null, 'Scanned pages read with OCR (' + S.scanned.join(', ') + '): '), 'OCR can misread characters, so detection here is less reliable, and anything it cannot read (handwriting, faint or skewed text) stays visible. Redaction blanks the image pixels under each box.');
    else d.append(el('b', null, 'Scanned pages: '), 'page(s) ' + S.scanned.join(', ') + ' have no readable text and OCR ' + (failed ? 'could not run (' + st.slice(7) + ')' : 'has not run') + ', so nothing was detected there. Draw boxes by hand or do not rely on this tool for those pages.');
    w.appendChild(d);
  }
  if (S.mixed.length) {
    const pl = S.mixed.map((m) => m.page + 1).join(', '), d = el('div', 'warn' + (failed ? ' bad' : ''));
    if (running) d.append(el('b', null, 'Pages with text and images: '), 'page(s) ' + pl + ' have selectable text plus large images. Text inside the images is being read with OCR.');
    else if (done) d.append(el('b', null, 'Pages with text and images (' + pl + '): '), 'the selectable text was checked directly and text inside the large images was read with OCR (never counted twice). OCR can misread, and small images (under about 2% of the page, such as logos or stamps) are not read.');
    else d.append(el('b', null, 'Pages with text and images (' + pl + '): '), 'text inside the images was NOT checked' + (failed ? ' (OCR could not run: ' + st.slice(7) + ')' : '') + '. Only the selectable text on these pages was scanned.');
    w.appendChild(d);
  }
  const partial = S.dets.filter((d) => d.partial).length;
  if (partial) { const d = el('div', 'warn partialwarn'); d.append(el('b', null, partial + ' name(s) are marked partial?: '), 'they may be only part of a person\u2019s name (a single word, or next to another capitalised word). Redacting them does not prove the whole name is gone.'); w.appendChild(d); }
  if (unchecked) { const d = el('div', 'warn'); d.append(el('b', null, unchecked + ' item(s) are unchecked '), 'and will stay visible in the export.'); w.appendChild(d); }
  const inv = S.inventory, extras = [['annotations', 'comments/annotations'], ['form_fields', 'form fields'], ['attachments', 'attachments'], ['bookmarks', 'bookmarks'], ['links', 'links']].filter(([k]) => inv[k]).map(([k, l]) => inv[k] + ' ' + l);
  if (extras.length) { const d = el('div', 'warn'); d.append(el('b', null, 'Also in this file: '), extras.join(', ') + '. Visible comments and form values are flattened (so they can be redacted); everything else is removed from the export.'); w.appendChild(d); }
  const n = selCount(); $('count').textContent = n + ' of ' + S.dets.length + ' item' + (S.dets.length === 1 ? '' : 's') + ' selected';
  const g = $('go'); if (!S.busy) g.textContent = 'Redact Selected Information'; g.disabled = !n || !!S.busy || !!(S.ocr && S.ocr.startsWith('running'));   // wait for OCR before redacting
  const poss2 = S.dets.filter((d) => d.confidence !== 'high' && d.category !== 'manual'), t = $('togglePoss'); t.hidden = !poss2.length;
  t.textContent = poss2.every((d) => d.selected) ? 'Uncheck all possible matches' : 'Check all possible matches';
  t.onclick = () => { const on = !poss2.every((d) => d.selected); poss2.forEach((d) => (d.selected = on)); renderAll(); };
}
function renderGroups() {
  const host = $('groups'); const open = new Set([...host.querySelectorAll('details[open]')].map((d) => d.dataset.cat)); const first = !host.children.length; host.textContent = '';
  for (const cat of ORDER) {
    const list = S.dets.filter((d) => d.category === cat); if (!list.length) continue;
    const det = el('details'); det.dataset.cat = cat; if (first || open.has(cat)) det.open = true;
    const sum = el('summary'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = list.every((d) => d.selected); cb.indeterminate = !cb.checked && list.some((d) => d.selected);
    cb.onclick = (ev) => { ev.stopPropagation(); list.forEach((d) => (d.selected = cb.checked)); renderAll(); };
    const poss = list.filter((d) => d.confidence !== 'high').length;
    cb.setAttribute('aria-label', 'Select all: ' + LABEL[cat]); sum.append(el('span', null, LABEL[cat] + ' (' + list.length + (poss ? ', ' + poss + ' possible' : '') + ')')); det.append(cb, sum);   // the checkbox sits beside the summary (not inside it) so it is a separate, labelled control
    const items = el('div', 'items');
    for (const d of list) {
      const row = el('label', 'item'); const c = el('input'); c.type = 'checkbox'; c.checked = d.selected; c.onchange = () => { d.selected = c.checked; renderAll(); };
      const t = el('span', 't', d.text.replace(/\s+/g, ' ')); t.title = d.reason; t.onclick = (ev) => { ev.preventDefault(); focusDet(d); };
      row.append(c, t, el('span', 'pg', 'p.' + (d.page + 1)), el('span', 'badge ' + (d.confidence === 'high' ? 'high' : 'poss'), d.category === 'manual' ? 'manual' : d.confidence === 'high' ? 'likely' : 'possible'));
      if (d.ocr) { const ob = el('span', 'badge', 'OCR'); ob.title = 'read from a scanned image'; row.appendChild(ob); }
      if (d.partial) { const pb = el('span', 'badge partial', 'partial?'); pb.title = d.partial; row.appendChild(pb); }
      items.appendChild(row);
    }
    det.appendChild(items); host.appendChild(det);
  }
}
function renderOverlays() {
  S.pageEls.forEach((p) => p.querySelectorAll('.det').forEach((n) => n.remove()));
  for (const d of S.dets) for (const r of d.rects) {
    const n = el('div', 'det' + (d.confidence === 'high' ? '' : ' poss') + (d.selected ? '' : ' off')); n.dataset.id = d.id; n.title = LABEL[d.category] + ': ' + d.text + ' (' + d.reason + ')' + (d.partial ? ' - may be only part of a name: ' + d.partial : '');
    Object.assign(n.style, { left: r[0] * SCALE + 'px', top: r[1] * SCALE + 'px', width: (r[2] - r[0]) * SCALE + 'px', height: (r[3] - r[1]) * SCALE + 'px' });
    n.onclick = () => { d.selected = !d.selected; renderAll(); }; S.pageEls[d.page].appendChild(n);
  }
}
function focusDet(d) { const p = S.pageEls[d.page]; p.scrollIntoView({ block: 'center', behavior: 'smooth' }); const n = p.querySelector('.det[data-id="' + d.id + '"]'); if (n) { n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1500); } }

// optional manual boxes
$('manual').onchange = () => { $('pages').classList.toggle('manualmode', $('manual').checked); };
function manualDraw(ev, page, pno) {
  if (!$('manual').checked || ev.button !== 0) return; ev.preventDefault();
  const b = page.getBoundingClientRect(), x0 = ev.clientX - b.left, y0 = ev.clientY - b.top, live = el('div', 'draft'); page.appendChild(live); let r = null;
  const mv = (e) => { const x1 = Math.max(0, Math.min(b.width, e.clientX - b.left)), y1 = Math.max(0, Math.min(b.height, e.clientY - b.top)); Object.assign(live.style, { left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' }); r = [Math.min(x0, x1) / SCALE, Math.min(y0, y1) / SCALE, Math.max(x0, x1) / SCALE, Math.max(y0, y1) / SCALE]; };
  const up = (e) => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); mv(e); live.remove(); if (r && r[2] - r[0] > 3 && r[3] - r[1] > 3) { S.dets.push({ id: 100000 + S.nextManual++, page: pno, category: 'manual', confidence: 'high', reason: 'drawn by you', text: 'Box on page ' + (pno + 1), rects: [r], selected: true }); renderAll(); } };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}

// redact + verify
$('go').onclick = async () => {
  const sel = S.dets.filter((d) => d.selected); if (!sel.length) return;
  const boxes = sel.flatMap((d) => d.rects.map((r) => ({ page: d.page, rect: r })));
  S.busy = true; $('go').disabled = true; $('go').textContent = 'Redacting and verifying…';
  const res = $('result'); res.hidden = true; res.textContent = '';
  try {
    const r = await ask({ type: 'redact', boxes }); res.hidden = false;
    if (!r.ok) return fail(res, r.message, r.report && r.report.problems);
    // independent check with pdf.js: selected text gone (allowing for occurrences the user chose to keep), boxes black, hidden data gone
    const groups = new Map();
    for (const d of sel) { if (d.category === 'manual') continue; const k = compact(d.text); if (k.length >= 3) groups.set(k, d.text); }
    const expectMax = [...groups].map(([k, text]) => ({ text, max: Math.max(0, countIn(S.fullCompact, k) - sel.reduce((a, d) => a + (d.category === 'manual' ? 0 : countIn(compact(d.text), k)), 0)) }));
    const v = await verifyWithPdfjs(r.out, { boxes, expectMax });
    if (!v.ok) return fail(res, 'The independent pdf.js check found problems, so the file was withheld.', v.problems);
    let reocr = null;
    const ocrSel = sel.filter((d) => d.ocr), ocrPagesChanged = [...new Set(ocrSel.map((d) => d.page))];
    if (ocrSel.length) {
      $('go').textContent = 'Second OCR pass on the export…'; const words = [];
      await renderWithPdfjs(r.out, ocrPagesChanged, OCR_SCALE, async (canvas) => { words.push(...(await recognizeWords(canvas))); });
      const after = compact(words.map((w) => w.text).join(' ')), leaks = [];
      for (const d of ocrSel) { const k = compact(d.text); if (k.length >= 4 && countIn(after, k) > S.dets.filter((x) => !x.selected && compact(x.text) === k).length) leaks.push(d.text); }
      if (leaks.length) return fail(res, 'A second OCR pass on the export could still read redacted text, so the file was withheld.', leaks.map((t) => '\u201C' + t + '\u201D still readable'));
      reocr = ocrPagesChanged.length;
    }
    success(res, r, v, sel, expectMax, reocr, r.out.length);
  } catch (err) { res.hidden = false; fail(res, err.message); }
  finally { S.busy = false; renderSummary(); }
};
function fail(res, msg, problems) {
  res.hidden = false; res.textContent = ''; res.className = 'card warn bad';
  res.append(el('h2', null, 'No file was produced'), el('p', null, msg)); if (problems && problems.length) { const u = el('ul', 'checks'); problems.forEach((p) => u.appendChild(el('li', null, p))); res.appendChild(u); }
  res.appendChild(el('p', 'tiny', 'The tool refuses to hand over a file it could not verify.'));
}
function success(res, r, v, sel, expectMax, reocr, outBytes) {
  res.className = 'card good'; res.textContent = '';
  const items = sel.length, kept = S.dets.filter((d) => !d.selected && d.category !== 'manual').length;
  res.append(el('h2', null, 'Selected items removed and checked'), el('p', null, 'Removed ' + items + ' selected item(s) on page(s) ' + r.report.pages_changed.join(', ') + '. The original file was not changed.'));
  const u = el('ul', 'checks'); [...r.report.checks.filter((c) => !/No independent/.test(c) && !/: 0 term\(s\) checked/.test(c)), 'pdf.js (independent engine): boxes render black; selected text no longer extractable; no annotations, form fields, bookmarks or document info (' + v.ms + ' ms)'].forEach((c) => u.appendChild(el('li', null, '✓ ' + c))); res.appendChild(u);
  if (reocr) u.appendChild(el('li', null, '\u2713 Second OCR pass on the exported scanned page(s) found none of the redacted text (a same-engine check, weaker than the pdf.js checks above)'));
  if (true) res.appendChild(el('p', 'tiny', 'File size: ' + fmtSize(S.origBytes) + ' \u2192 ' + fmtSize(outBytes) + '. ' + (S.ocrPages && S.ocrPages.length && outBytes > 1.3 * S.origBytes ? 'Redacted scan images are re-saved without lossy compression, so the file grows.' : '')));
  const again = expectMax.filter((e) => e.max > 0 && S.dets.some((d) => !d.selected && compact(d.text).includes(compact(e.text))));
  if (kept) res.appendChild(el('div', 'warn')).append(el('b', null, kept + ' detected item(s) were left unselected '), 'and remain in the document' + (again.length ? ' (the same text as something you redacted also still appears elsewhere)' : '') + '.');
  const partialSel = sel.filter((d) => d.partial);
  if (partialSel.length) { const w2 = el('div', 'warn partialwarn'); w2.append(el('b', null, partialSel.length + ' redacted name(s) may be only part of a name: '), partialSel.slice(0, 6).map((d) => '\u201C' + d.text + '\u201D').join(', ') + (partialSel.length > 6 ? ', \u2026' : '') + '. The rest of the person\u2019s name may still be visible. Check those places in the file.'); res.appendChild(w2); }
  const a = el('a', 'btn', 'Download ' + S.name.replace(/\.pdf$/i, '') + '.redacted.pdf'); a.download = S.name.replace(/\.pdf$/i, '').replace(/[^\w.\- ]/g, '_') + '.redacted.pdf'; a.href = blobUrl(new Blob([r.out], { type: 'application/pdf' })); res.appendChild(a);
  const d = el('div', 'warn'); d.append(el('b', null, 'Verified: '), 'the items you selected are gone from the file (text and image pixels under the boxes), and hidden data (metadata, comments, attachments, bookmarks, links) was stripped. ', el('b', null, 'Not verified: '), 'that every sensitive item in the original was found. Names and addresses in particular can be missed, possible matches may have included things that are not personal data, and scanned pages are read only by OCR, which can misread or skip text. Open the downloaded file and check every page before sharing.'); res.appendChild(d);
  res.scrollIntoView({ behavior: 'smooth' });
}

// re-fit the page previews when the window width changes (e.g. rotating a tablet); detections and selections are kept
let resizeT = null, lastW = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S && Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; build(); } }, 300); });
