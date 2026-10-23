// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Presentation only: drag and drop, landing/workspace layout, step indicator and progress bar. It never reads or changes document contents or the redaction logic in app.js.
const $ = (id) => document.getElementById(id);
const file = $('file'), drop = $('drop');
const fmtSize = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB');

// remember the chosen file's name and size (capture phase: app.js clears the input as soon as its own handler starts)
document.addEventListener('change', (e) => { if (e.target === file && file.files && file.files[0]) { $('docname').textContent = file.files[0].name; $('docsize').textContent = fmtSize(file.files[0].size); } }, true);

// drag and drop a PDF onto the drop area; the file goes through the same input and the same handler as "Choose PDF"
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { if (!hasFiles(e)) return; e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'dragend'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; const dt = new DataTransfer(); dt.items.add(f); file.files = dt.files; file.dispatchEvent(new Event('change', { bubbles: true })); });
// the whole landing card opens the file chooser (the label and the input already do it themselves)
drop.addEventListener('click', (e) => { if (e.target.closest('label, input, a, button')) return; if (e.target.closest('.drop-main')) file.click(); });
// stop the browser from navigating away to a PDF that is dropped outside the drop area
['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (hasFiles(e) && !drop.contains(e.target)) e.preventDefault(); }));

// layout state and progress, derived from what app.js already shows
const body = document.body, steps = [...document.querySelectorAll('.stepper li[data-step]')];
function sync() {
  const hasDoc = !$('work').hidden, res = $('result'), go = $('go'), w = $('warnings').textContent, st = $('status').textContent;
  const done = !res.hidden && res.classList.contains('good'), failed = !res.hidden && res.classList.contains('bad');
  const redacting = hasDoc && go.disabled && !/^Redact Selected/.test(go.textContent) && /Redact|OCR/.test(go.textContent);
  const ocr = hasDoc && /being read with OCR|is being read with OCR/.test(w);
  const scanning = !hasDoc && /^Scanning/.test(st);
  let phase = 'idle', label = '';
  if (scanning) { phase = 'scanning'; label = 'Scanning for personal information…'; }
  else if (hasDoc && done) phase = 'done';
  else if (redacting) { phase = 'redacting'; label = go.textContent; }
  else if (ocr) { phase = 'ocr'; label = 'Reading scanned pages with OCR…'; }
  else if (hasDoc) phase = 'review';
  if (failed && !redacting) phase = hasDoc ? 'review' : phase;
  body.classList.toggle('has-doc', hasDoc); body.dataset.phase = phase;
  $('progress').hidden = !['scanning', 'redacting', 'ocr'].includes(phase);
  $('phaseLabel').textContent = label;
  const cur = { idle: -1, scanning: 0, ocr: 1, review: 1, redacting: 2, done: 3 }[phase];
  steps.forEach((li, i) => { li.classList.toggle('done', i < cur); li.classList.toggle('cur', i === cur); if (i === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
}
const mo = new MutationObserver(sync);
[['work', { attributes: true, attributeFilter: ['hidden'] }], ['result', { attributes: true, attributeFilter: ['hidden', 'class'] }], ['status', { childList: true, characterData: true, subtree: true }], ['warnings', { childList: true, characterData: true, subtree: true }], ['go', { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['disabled'] }]].forEach(([id, o]) => mo.observe($(id), o));
sync();
