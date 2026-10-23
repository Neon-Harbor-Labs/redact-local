// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Accuracy floor for the detector on SYNTHETIC labelled documents (all names/numbers are fictional). Run: npm test
import test from 'node:test'; import assert from 'node:assert/strict';
import { detectDocument } from '../public/js/detect.js'; import { loadNlp, addNlpNames } from '../public/js/names_nlp.js';
import { SET_A, SET_B } from './fixtures/docs-ab.mjs'; import { SET_C } from './fixtures/docs-c.mjs'; import { SET_D } from './fixtures/docs-d.mjs';
const nlp = await loadNlp();
const parse = (src) => { const spans = []; let plain = ''; const re = /\[\[(\w+)\|([^\]]*)\]\]/g; let last = 0, m; while ((m = re.exec(src))) { plain += src.slice(last, m.index); spans.push({ category: m[1], start: plain.length, end: plain.length + m[2].length }); plain += m[2]; last = re.lastIndex; } return { plain: plain + src.slice(last), spans }; };
const ov = (a, b) => a.start < b.end && b.start < a.end;
function score(docs, { categories } = {}) {
  let truth = 0, hitHigh = 0, hitAny = 0, tpHigh = 0, fpHigh = 0;
  for (const d of docs) {
    const parsed = d.pages.map(parse), pages = parsed.map((p) => ({ text: p.plain, rects: null })), base = detectDocument(pages), dets = base.concat(addNlpNames(nlp, pages, base, base.length));
    parsed.forEach((p, pi) => {
      const here = dets.filter((x) => x.page === pi && (!categories || categories.includes(x.category)));
      for (const t of p.spans.filter((s) => !categories || categories.includes(s.category))) { truth++; const hs = here.filter((x) => x.category === t.category && ov(x, t)); if (hs.length) hitAny++; if (hs.some((x) => x.confidence === 'high')) hitHigh++; }
      for (const x of here.filter((y) => y.confidence === 'high')) p.spans.some((t) => t.category === x.category && ov(x, t)) ? tpHigh++ : fpHigh++;
    });
  }
  return { truth, recallAny: hitAny / truth, recallHigh: hitHigh / truth, precisionHigh: tpHigh / Math.max(1, tpHigh + fpHigh) };
}
test('structured identifiers (SSN, cards, banks, phones, emails, DOB, addresses): likely matches are precise and complete', () => {
  const cats = ['ssn', 'card', 'bank', 'phone', 'email', 'dob', 'address'];
  for (const [n, set] of [['A', SET_A], ['B', SET_B], ['D', SET_D]]) { const s = score(set, { categories: cats }); if (!s.truth) continue; assert(s.precisionHigh >= 0.95, n + ' precision ' + s.precisionHigh); assert(s.recallAny >= 0.9, n + ' recall ' + s.recallAny); }
});
test('names: rules + language analysis find most names once uncertain matches are included', () => {
  assert(score(SET_D, { categories: ['name'] }).recallAny >= 0.7); assert(score(SET_C, { categories: ['name'] }).recallAny >= 0.7); assert(score(SET_A, { categories: ['name'] }).recallAny >= 0.95);
  assert(score(SET_D, { categories: ['name'] }).precisionHigh >= 0.95);   // likely names must be right
});
test('generic salutations and plain business prose produce no likely detections', () => {
  const text = 'Dear Customer, Dear Valued Customer, Dear Sir or Madam. Revenue grew 12.4% to $4,310,552.18. Invoice 100234-5567, PO 123456789, SKU 555-1234, Version 2.3.1, Highway 101 closures end Friday. Latitude 40.7128, longitude -74.0060.';
  const d = detectDocument([{ text, rects: null }]); assert.deepEqual(d.filter((x) => x.confidence === 'high').map((x) => x.text), []);
});
test('compromise suggestions are always "possible" and never overlap other detections', () => {
  const pages = [{ text: 'The accident was witnessed by Chidinma Okafor and Layla Al-Mansour. SSN 512-44-7810.', rects: null }], base = detectDocument(pages), extra = addNlpNames(nlp, pages, base, base.length);
  assert(extra.every((x) => x.confidence === 'possible' && x.viaNlp)); for (const e of extra) assert(!base.some((b) => b.start < e.end && e.start < b.end));
});
