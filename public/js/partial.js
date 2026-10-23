// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Flags name detections that may be only PART of a person's name, so the UI never presents them as complete-name redactions.
//  - a single word (first or last name only), or
//  - directly next to a capitalised word that is not itself part of a detected name ("Nurse Esperanza").
const WORD_BEFORE = /(\p{Lu}[\p{L}'’-]+)[ \t\n]+$/u, WORD_AFTER = /^[ \t\n]+(\p{Lu}[\p{L}'’-]+)/u;
const ROLE = new Set('nurse doctor dr mr mrs ms miss mx prof professor judge officer attorney counsel patient client mother father sister brother husband wife daughter son uncle aunt dear'.split(' '));
const ignorable = (w) => ROLE.has(w.toLowerCase()) || (/^[\p{Lu}]+$/u.test(w) && w.length <= 6);   // titles, relationship words and labels such as DOB/SSN are not name parts
export function annotatePartial(targets, pages, all) {
  const pool = all || targets;
  for (const d of targets) {
    if (d.category !== 'name') continue;
    const text = pages[d.page].text, reasons = [];
    if (!/\s/.test(d.text.trim())) reasons.push('one word only: the rest of this person’s name may be elsewhere or not detected');
    const b = WORD_BEFORE.exec(text.slice(Math.max(0, d.start - 40), d.start)), a = WORD_AFTER.exec(text.slice(d.end, d.end + 40));
    const covered = (s, e) => pool.some((x) => x.page === d.page && x !== d && x.category === 'name' && x.start < e && s < x.end);
    if (b && !ignorable(b[1])) { const e = d.start - (text.slice(Math.max(0, d.start - 40), d.start).length - b.index - b[0].length), s = e - b[1].length; if (!covered(s, e)) reasons.push('next to “' + b[1] + '”, which is not part of a detected name'); }
    if (a && !ignorable(a[1])) { const s = d.end + a.index + a[0].length - a[1].length, e = s + a[1].length; if (!covered(s, e)) reasons.push('next to “' + a[1] + '”, which is not part of a detected name'); }
    d.partial = reasons.length ? reasons.join('; ') : null;
  }
  return targets;
}
