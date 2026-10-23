// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Neon Harbor Labs. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Optional second pass for personal names using compromise (MIT, vendored in ../vendor/compromise). Adds POSSIBLE detections only; nothing here is ever pre-selected.
// Rules: existing detections always win; candidates are cleaned so spans are never merged lists or carry stray words.
import { rectsFor } from './detect.js';

let loading = null;
export function loadNlp() { return (loading ||= import('../vendor/compromise/compromise-three.mjs').then((m) => m.default)); }

const PARTICLES = new Set('de del della di da van von der den la le al el bin ibn bint dos das du'.split(' '));
const GENERIC = new Set(('hall center centre school university college church cathedral hospital clinic bank park street avenue road river lake mount mountain island bridge airport station company ' +
  'inc corp ltd llc association department office museum library hotel inn cafe restaurant market square tower plaza court county city state republic kingdom partners enterprises group ' +
  'foundation institute agency bureau council committee board airlines airways air suites pavilion fund trust holdings systems services solutions technologies mutual insurance').split(' '));
const STOP = new Set(('monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ' +
  'the a an this that these those there their please thank thanks dear sincerely regards re sir madam customer valued member plaintiff defendant counsel client patient').split(' '));

const isUpper = (w) => /^\p{Lu}/u.test(w), hasLetter = (w) => /\p{L}/u.test(w);
const bare = (w) => w.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '').replace(/['’]s$/i, '');

// One raw compromise match -> zero or more clean name spans [{start,end}] (offsets into the page text).
export function cleanCandidate(text, start, end) {
  const out = [], raw = text.slice(start, end);
  const segRe = /[^;,\n&]+/g; let m;
  while ((m = segRe.exec(raw))) {
    const parts = m[0].split(/\s+(?:and|or)\s+/); let off = m.index;
    for (const part of parts) {
      const base = start + off + (m[0].indexOf(part, off - m.index)); off += part.length + 1;
      const toks = []; const tokRe = /\S+/g; let t;
      while ((t = tokRe.exec(part))) toks.push({ w: t[0], s: base + t.index, e: base + t.index + t[0].length });
      const ok = (x) => { const b = bare(x.w); return b && isUpper(b) || PARTICLES.has(b.toLowerCase()); };
      while (toks.length && !isUpper(bare(toks[0].w))) toks.shift();               // leading lowercase words ("brother Emeka")
      while (toks.length && !ok(toks[toks.length - 1])) toks.pop();               // trailing lowercase words
      while (toks.length && PARTICLES.has(bare(toks[toks.length - 1].w).toLowerCase())) toks.pop();
      if (!toks.length || toks.length > 4) continue;
      if (toks.some((x) => !hasLetter(x.w) || !ok(x))) continue;                   // inner lowercase word or no letters: malformed
      const words = toks.map((x) => bare(x.w)); if (words.some((w) => GENERIC.has(w.toLowerCase()) || STOP.has(w.toLowerCase()))) continue;
      if (toks.length === 1 && words[0].length < 3) continue;
      let s = toks[0].s, e = toks[toks.length - 1].e;
      while (e > s && /[^\p{L}]$/u.test(text.slice(s, e))) e--;                    // trailing punctuation
      if (/['’]s$/i.test(text.slice(s, e))) e -= 2;                                // possessive
      out.push({ start: s, end: e });
    }
  }
  return out;
}

export function nlpCandidates(nlp, text) {
  const doc = nlp(text), people = doc.people().not('#Organization').not('#Place'), out = [];
  for (const j of people.json({ offset: true })) { const o = j.offset; if (o) out.push(...cleanCandidate(text, o.start, o.start + o.length)); }
  return out;
}

// pages: [{text, rects}], dets: existing detections (with .page .start .end), nextId: first free id. Returns new detections.
export function addNlpNames(nlp, pages, dets, nextId) {
  const added = [], overlap = (a, b) => a.start < b.end && b.start < a.end;
  const free = (pi, c) => !dets.some((d) => d.page === pi && overlap(d, c)) && !added.some((d) => d.page === pi && overlap(d, c));
  const mk = (pi, c, reason) => ({ id: nextId++, page: pi, category: 'name', confidence: 'possible', reason, text: pages[pi].text.slice(c.start, c.end), start: c.start, end: c.end, rects: pages[pi].rects ? rectsFor(pages[pi], c.start, c.end) : [], viaNlp: true });
  const found = new Set();
  pages.forEach((p, pi) => {
    const cands = nlpCandidates(nlp, p.text).sort((a, b) => (b.end - b.start) - (a.end - a.start));   // longest first: duplicates and sub-spans collapse
    for (const c of cands) if (free(pi, c)) { added.push(mk(pi, c, 'name suggested by language analysis (compromise); please check')); found.add(p.text.slice(c.start, c.end)); }
  });
  for (const str of found) {                                              // the same name elsewhere in the document
    const re = new RegExp('(?<![\\p{L}])' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'gu');
    pages.forEach((p, pi) => { let m; re.lastIndex = 0; while ((m = re.exec(p.text))) { const c = { start: m.index, end: m.index + str.length }; if (free(pi, c)) added.push(mk(pi, c, 'repeat of a name suggested by language analysis')); } });
  }
  return added.sort((a, b) => a.page - b.page || a.start - b.start);
}
