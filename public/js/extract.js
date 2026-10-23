// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Page text + per-character rectangles from MuPDF structured text (shared by the worker and Node tests).
export function extractPage(page) {
  const st = page.toStructuredText('preserve-whitespace');
  let text = ''; const rects = [];
  const push = (c, r) => { for (let k = 0; k < c.length; k++) { text += c[k]; rects.push(r); } };
  st.walk({
    beginTextBlock() { if (text && !text.endsWith('\n')) push('\n', null); if (text) push('\n', null); },
    beginLine() { if (text && !text.endsWith('\n')) push('\n', null); },
    onChar(c, o, f, s, q) { push(c, [Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])]); },
  });
  const arr = new Float32Array(rects.length * 4);
  rects.forEach((r, i) => { if (r) arr.set(r, 4 * i); else arr.fill(NaN, 4 * i, 4 * i + 4); });
  return { text, rects: arr };
}
