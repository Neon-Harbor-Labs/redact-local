// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Neon Harbor Labs. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Automatic detection of personal information. Pure JS, no DOM, no network, no models.
// detectText(text)            -> matches [{category, confidence, reason, start, end}]
// detectDocument(pages)       -> detections with per-line rects; pages = [{text, rects}] (rects[i] = [x0,y0,x1,y1] | null per char)
// Confidence: 'high' = strong format/context evidence; 'possible' = plausible but needs a human look.

export const CATEGORIES = {
  name: 'Names', address: 'Street addresses', phone: 'Phone numbers', email: 'Email addresses', ssn: 'Social Security numbers',
  card: 'Credit card numbers', dob: 'Dates of birth', bank: 'Bank account numbers', govid: 'Government & other ID numbers',
};

const FIRST = new Set(('James Mary John Patricia Robert Jennifer Michael Linda William Elizabeth David Barbara Richard Susan Joseph Jessica Thomas Sarah Charles Karen ' +
  'Christopher Nancy Daniel Lisa Matthew Betty Anthony Margaret Mark Sandra Donald Ashley Steven Kimberly Paul Emily Andrew Donna Joshua Michelle Kenneth Carol Kevin ' +
  'Amanda Brian Melissa George Deborah Timothy Stephanie Ronald Dorothy Jason Rebecca Edward Sharon Jeffrey Laura Ryan Cynthia Jacob Kathleen Gary Amy Nicholas Angela ' +
  'Eric Shirley Jonathan Anna Stephen Brenda Larry Pamela Justin Emma Scott Nicole Brandon Helen Benjamin Samantha Samuel Katherine Gregory Christine Alexander Debra ' +
  'Frank Rachel Patrick Carolyn Raymond Janet Jack Catherine Dennis Maria Jerry Heather Tyler Diane Aaron Ruth Jose Julie Adam Olivia Nathan Joyce Henry Virginia ' +
  'Douglas Victoria Zachary Kelly Peter Lauren Kyle Christina Noah Joan Ethan Evelyn Jeremy Judith Walter Megan Christian Andrea Keith Cheryl Roger Hannah Terry ' +
  'Jacqueline Austin Martha Sean Gloria Gerald Teresa Carl Ann Harold Sara Dylan Madison Arthur Frances Lawrence Kathryn Jordan Jesse Bryan Janice Billy Jean Bruce ' +
  'Abigail Gabriel Alice Joe Julia Logan Judy Albert Sophia Willie Grace Alan Denise Juan Amber Wayne Doris Elijah Marilyn Randy Danielle Roy Beverly Vincent ' +
  'Isabella Ralph Theresa Eugene Diana Russell Natalie Bobby Brittany Mason Charlotte Philip Marie Louis Kayla Alexis Casey Taylor Morgan Riley Avery Cameron Alex ' +
  'Sam Chris Carlos Luis Miguel Ana Sofia Priya Wei Mohammed Fatima Aisha Omar Ali Hiroshi Yuki Lucia Elena Marcus Tamika Jamal Latoya Diego Pedro Rosa Carmen Angel').split(' '));
const LAST = new Set(('Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee ' +
  'Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill Flores Green Adams Nelson Baker Hall Rivera ' +
  'Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Gutierrez Ortiz Morgan ' +
  'Cooper Peterson Bailey Reed Kelly Howard Ramos Kim Cox Ward Richardson Watson Brooks Chavez Wood James Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo ' +
  'Sanders Patel Myers Long Ross Foster Jimenez Powell Jenkins Perry Russell Sullivan Bell Coleman Butler Henderson Barnes Fisher Vasquez Simmons Romero Jordan ' +
  'Patterson Alexander Hamilton Graham Reynolds Griffin Wallace Moreno West Cole Hayes Bryant Herrera Gibson Ellis Tran Medina Aguilar Stevens Murray Ford Castro ' +
  'Marshall Owens Harrison Fernandez Woods Washington Kennedy Wells Vargas Henry Chen Freeman Webb Tucker Guzman Burns Crawford Olson Simpson Porter Hunter Gordon ' +
  'Mendez Silva Shaw Snyder Mason Dixon Munoz Hunt Hicks Holmes Palmer Wagner Black Robertson Boyd Rose Stone Salazar Fox Warren Mills Meyer Rice Schmidt Singh ' +
  'Nakamura Tanaka Kowalski Novak Ivanov Okafor Haddad Khan Ahmed Hassan Ali Wong Wang Zhang Liu Yamamoto Suzuki Sato').split(' '));
// capitalised words that are not names when they follow a label or start a sentence
const NOT_NAME = new Set(('The A An This That These Those There Their Please Thank Thanks Summary Total Date Page Section Number None Unknown Not Same All Any Yes No N/A Na ' +
  'Applicant Client Patient Name Address Phone Email Contact Signature Signed Form Application Information Report Statement Account Bank Insurance Policy Benefits ' +
  'Review Notes Details Employer Employee Department Company Office Division Street Avenue City State Zip Date Birth Social Security Driver License Passport ' +
  'Customer Customers Sir Sirs Madam Madame Valued Member Members User Guest Friend Friends Team Everyone Colleague Colleagues Parent Parents Student Students Resident Residents Owner Sincerely Regards').split(' '));

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const ci = (w) => w.split('').map((c) => (/[a-z]/i.test(c) ? '[' + c.toLowerCase() + c.toUpperCase() + ']' : c)).join('');
const SUFFIX = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Boulevard', 'Blvd', 'Lane', 'Ln', 'Drive', 'Dr', 'Court', 'Ct', 'Way', 'Place', 'Pl', 'Parkway', 'Pkwy', 'Highway', 'Hwy', 'Terrace', 'Ter', 'Circle', 'Cir', 'Trail', 'Trl', 'Square', 'Sq'].map(ci).join('|');

const CONF = { high: 'high', possible: 'possible' };
const before = (t, i, n = 50) => t.slice(Math.max(0, i - n), i).replace(/\s+/g, ' ').toLowerCase();
const digits = (s) => s.replace(/\D/g, '');

function luhn(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
function abaOk(d) { if (d.length !== 9) return false; const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]; return d.split('').reduce((a, c, i) => a + +c * w[i], 0) % 10 === 0; }
function ibanOk(s) { const r = s.replace(/\s/g, '').toUpperCase(); const x = (r.slice(4) + r.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55); let rem = 0; for (const ch of x) rem = (rem * 10 + +ch) % 97; return rem === 1; }

function* rx(re, text) { re.lastIndex = 0; let m; while ((m = re.exec(text))) { yield m; if (m[0].length === 0) re.lastIndex++; } }

export function detectText(text) {
  const out = [], add = (category, confidence, reason, start, end) => { if (end > start) out.push({ category, confidence, reason, start, end }); };
  const group = (m, i) => (m.indices && m.indices[i]) ? m.indices[i] : null;

  // ---- email
  for (const m of rx(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g, text)) add('email', CONF.high, 'email format', m.index, m.index + m[0].length);

  // ---- SSN / ITIN
  for (const m of rx(/(?<![\d-])(\d{3})-(\d{2})-(\d{4})(?![\d-])/g, text)) {
    const itin = m[1][0] === '9' && /[7-9]/.test(m[2][0]);
    add(itin ? 'govid' : 'ssn', CONF.high, itin ? 'ITIN format' : 'SSN format ddd-dd-dddd', m.index, m.index + m[0].length);
  }
  for (const m of rx(/(?<![\d])(\d{3}[ ]\d{2}[ ]\d{4}|\d{9})(?![\d])/g, text)) {
    if (/\bssn\b|\bsocial\b/.test(before(text, m.index, 40))) add('ssn', CONF.high, 'nine digits after an SSN label', m.index, m.index + m[0].length);
  }

  // ---- credit cards
  for (const m of rx(/(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g, text)) {
    const d = digits(m[0]); if (d.length < 13 || d.length > 19) continue;
    const grouped = /^\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}$|^\d{4}[ -]\d{6}[ -]\d{5}$/.test(m[0]);
    const prefixOk = /^(?:3[47]|4|5[1-5]|2[2-7]|6(?:011|5|4[4-9]))/.test(d);
    if (luhn(d) && (prefixOk || /card|visa|mastercard|amex|credit/.test(before(text, m.index, 40)))) add('card', CONF.high, 'Luhn-valid card number', m.index, m.index + m[0].length);
    else if (luhn(d) && grouped) add('card', CONF.possible, 'Luhn-valid, unknown issuer', m.index, m.index + m[0].length);
    else if (grouped && /card|visa|mastercard|amex|credit/.test(before(text, m.index, 40))) add('card', CONF.possible, 'card-style grouping, checksum fails', m.index, m.index + m[0].length);
  }

  // ---- phone
  const phoneRe = /(?<![\w-])(?:\+?1[\s.-]?)?(\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])/g;
  for (const m of rx(phoneRe, text)) {
    const ctx = /phone|tel\b|telephone|mobile|cell|fax|call|contact|reach/.test(before(text, m.index, 35));
    const d = digits(m[0]), local = d.length === 11 ? d.slice(1) : d;
    const nanp = /^[2-9]\d\d[2-9]\d\d\d{4}$/.test(local);
    const strong = /^\+|^\(|^1[\s.-]/.test(m[0]);
    const org = /^(?:8(?:00|33|44|55|66|77|88))/.test(local) || /customer service|support|hotline|helpline|toll|main office|switchboard/.test(before(text, m.index, 40));
    if (org && nanp) add('phone', CONF.possible, 'looks like an organisation number (toll-free / support line)', m.index, m.index + m[0].length);
    else if (ctx || (strong && nanp)) add('phone', CONF.high, ctx ? 'phone-number format with label' : 'phone-number format', m.index, m.index + m[0].length);
    else if (nanp) add('phone', CONF.possible, 'looks like a phone number (no label)', m.index, m.index + m[0].length);
  }
  for (const m of rx(/(?<![\w-])\+\d{1,3}[\s.-]\(?\d{1,4}\)?(?:[\s.-]\d{2,4}){2,4}(?![\w-])/g, text)) {
    if (!out.some((o) => o.category === 'phone' && o.start < m.index + m[0].length && m.index < o.end)) add('phone', CONF.possible, 'international phone format', m.index, m.index + m[0].length);
  }

  // ---- dates of birth (a date is only reported with birth context; ordinary dates are not personal data by themselves)
  const dateRes = [
    /(?<![\d/.-])(?:0?[1-9]|1[0-2])[\/.-](?:0?[1-9]|[12]\d|3[01])[\/.-](?:19|20)\d{2}(?![\d])/g,
    /(?<![\d-])(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\d])/g,
    new RegExp('(?<![A-Za-z])' + MONTH + '\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}(?!\\d)', 'g'),
    new RegExp('(?<!\\d)\\d{1,2}\\s+' + MONTH + '\\.?,?\\s+(?:19|20)\\d{2}(?!\\d)', 'g'),
  ];
  for (const re of dateRes) for (const m of rx(re, text)) {
    const c = before(text, m.index, 45).replace(/^[\s\S]*\d/, '');   // ignore labels that belong to an earlier date
    if (/\bdob\b|d\.o\.b|date of birth|birth ?date|birthday|\bborn\b|b-day|birth:/.test(c)) add('dob', CONF.high, 'date after a birth label', m.index, m.index + m[0].length);
  }

  // ---- bank
  for (const m of rx(/(?:acc(?:ou)?nt|acct)\.?[ \t]*(?:number|no\.?|num\.?|#)?[ \t]*[:#]?[ \t]*((?:\d[ -]?){6,16}\d)/gid, text)) {
    const g = group(m, 1); if (g && digits(m[1]).length >= 7 && digits(m[1]).length <= 17) add('bank', CONF.high, 'digits after an account label', g[0], g[1]);
  }
  for (const m of rx(/(?:routing|aba|rtn)[ \t]*(?:number|no\.?|#)?[ \t]*[:#]?[ \t]*(\d{9})(?!\d)/gid, text)) {
    const g = group(m, 1); if (g) add('bank', abaOk(m[1]) ? CONF.high : CONF.possible, abaOk(m[1]) ? 'valid ABA routing checksum' : 'routing label, checksum fails', g[0], g[1]);
  }
  for (const m of rx(/(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?(?![A-Za-z0-9])/g, text)) {
    if (m[0].replace(/\s/g, '').length >= 15 && ibanOk(m[0])) add('bank', CONF.high, 'valid IBAN checksum', m.index, m.index + m[0].length);
  }

  // ---- government / other IDs
  const idLabel = (re, reason, conf, minDigits) => { for (const m of rx(re, text)) { const g = group(m, 1); if (!g) continue; const v = m[1]; if (digits(v).length >= minDigits && v.length >= 5) add('govid', conf, reason, g[0], g[1]); } };
  idLabel(/(?:driver'?s?[ \t]*licen[sc]e|\bD\.?L\.?\b|licen[sc]e)[ \t]*(?:number|no\.?|num\.?|#)?[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9\- ]{4,16}[A-Z0-9])/gid, "driver's licence number after a label", CONF.high, 5);
  idLabel(/passport[ \t]*(?:number|no\.?|#)?[ \t]*[:#]?[ \t]*([A-Z0-9]{6,9})(?![A-Za-z0-9])/gid, 'passport number after a label', CONF.high, 1);
  idLabel(/(?:state[ \t]*id|national[ \t]*id|tax[ \t]*id|taxpayer[ \t]*id|\bEIN\b|\bITIN\b)[ \t]*(?:number|no\.?|#)?[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9\-]{5,15})/gid, 'government ID after a label', CONF.high, 5);
  idLabel(/(?:member|policy|patient|employee|student|medicare|medicaid|insurance)[ \t]*(?:id|number|no\.?|#)[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9\-]{4,17})/gid, 'identifier after a label (member/policy/patient/employee)', CONF.possible, 4);

  // ---- addresses
  const city = '(?:,?[ \\t]*(?:\\n[ \\t]*)?[A-Z][A-Za-z.\'-]+(?:[ \\t]+[A-Z][A-Za-z.\'-]+){0,2},?[ \\t]+([A-Z]{2})[ \\t]+\\d{5}(?:-\\d{4})?)?';
  const unit = '(?:,?[ \\t]*(?:' + ['Apt', 'Apartment', 'Suite', 'Ste', 'Unit', 'Floor', 'Fl'].map(ci).join('|') + ')\\.?[ \\t]*#?[A-Za-z0-9-]+|,?[ \\t]*#[ \\t]*[A-Za-z0-9-]+)?';
  const street = new RegExp('(?<![\\w])\\d{1,6}[ \\t]+(?:(?:[NSEW]|North|South|East|West)\\.?[ \\t]+)?(?:[A-Z][A-Za-z\'.-]*[ \\t]+){0,3}[A-Z0-9][A-Za-z0-9\'.-]*[ \\t]+(?:' + SUFFIX + ')\\b\\.?' + unit + city, 'g');
  for (const m of rx(street, text)) {
    let end = m.index + m[0].length; let t = m[0];
    if (m[1] && !STATES.has(m[1])) { // trailing "City XX 12345" with an invalid state: keep only the street part
      const cut = t.search(/,?[ \t]*(?:\n[ \t]*)?[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,2},?[ \t]+[A-Z]{2}[ \t]+\d{5}/); if (cut > 0) end = m.index + cut;
    }
    const orgCtx = /located at|office|headquarters|clinic|school|landlord|properties|\bllc\b|\binc\b|corp|branch|store|warehouse|campus|company|hospital/.test(before(text, m.index, 60));
    add('address', orgCtx ? CONF.possible : CONF.high, orgCtx ? 'street address, but context suggests an organisation' : 'street address pattern', m.index, end);
  }
  for (const m of rx(/(?<![\w])P\.?[ ]?O\.?[ ]+Box[ ]+\d+/gi, text)) add('address', CONF.high, 'PO box', m.index, m.index + m[0].length);
  for (const m of rx(/(?<![A-Za-z])[A-Z][a-zA-Z.'-]+(?:[ \t]+[A-Z][a-zA-Z.'-]+){0,2},?[ \t]+([A-Z]{2})[ \t]+\d{5}(?:-\d{4})?(?!\d)/g, text)) {
    if (STATES.has(m[1]) && !out.some((o) => o.category === 'address' && o.start <= m.index && o.end >= m.index + m[0].length)) add('address', CONF.possible, 'city, state and ZIP', m.index, m.index + m[0].length);
  }

  // ---- names (no model: labels, titles, small first-name list, repeats)
  const tok = "\\p{Lu}[\\p{Ll}'’-]+(?:\\p{Lu}\\p{Ll}+)?", mid = "(?:\\p{Lu}\\.|" + tok + ")";
  const nameTail = '(' + tok + '(?:[ \\t]' + mid + '(?!:)){0,3})';   // single spaces only: two or more spaces mean a new column/field
  const LABELS = 'this[ \\t]+is|my[ \\t]+name[ \\t]+is|I[ \\t]+am|I\\u2019m|I\'m|name\\u2019s|name\'s|Patient|Client|Applicant|Student|Parent|Guardian|Employee|Subject|Customer|Name|Full[ \\t]+Name|Contact|Emergency[ \\t]+Contact|Spouse|Beneficiary|Insured|Member|Claimant|Witness|Mother|Father|Signed|Prepared[ \\t]+by|Submitted[ \\t]+by|Reviewed[ \\t]+by|Attn|Attention|Sincerely|Regards|Dear|Resident|Tenant|Borrower|Owner|Account[ \\t]+holder|Cardholder|Dependent|Guarantor|Co-signer|Cosigner|Relative|Sibling|Child|Nominee|Referee';
  const nameSeen = [];
  const nameAdd = (conf, reason, s, e) => {
    const str = text.slice(s, e).trim(); const toks = str.split(/\s+/);
    while (toks.length && NOT_NAME.has(toks[toks.length - 1].replace(/[.,]$/, ''))) toks.pop();
    if (!toks.length || NOT_NAME.has(toks[0])) return;
    const clean = toks.join(' '); const st = s + text.slice(s, e).indexOf(toks[0]);
    add('name', conf, reason, st, st + clean.length); nameSeen.push({ str: clean, conf });
  };
  for (const m of rx(new RegExp('(?<![\\p{L}])(?:(?:' + LABELS + ')[ \\t]*[:,/]?[ \\t]*(?:\\n[ \\t]*)?)+(?:(?:Mr|Mrs|Ms|Miss|Dr|Prof|Mx)\\.?[ \\t]+)?' + nameTail, 'gdu'), text)) {
    const g = group(m, 1); if (g) nameAdd(CONF.high, 'name after a label', g[0], g[1]);
  }
  for (const m of rx(new RegExp('(?<![\\p{L}])(?:Mr|Mrs|Ms|Miss|Dr|Prof|Mx)\\.?[ \\t]+' + nameTail, 'gdu'), text)) {
    const g = group(m, 1); if (g) nameAdd(CONF.high, 'name after a title', g[0], g[1]);
  }
  for (const m of rx(new RegExp('(?<![\\p{L}])(' + tok + ')[ \\t]+(?:(\\p{Lu}\\.)[ \\t]+)?(' + tok + ')(?![\\p{L}])', 'gu'), text)) {
    if (FIRST.has(m[1]) && !NOT_NAME.has(m[3]) && (LAST.has(m[3]) || m[3].length >= 4)) {
      if (!out.some((o) => o.category === 'name' && o.start <= m.index && o.end >= m.index + m[0].length)) nameAdd(CONF.possible, 'first name from a common-names list + capitalised word', m.index, m.index + m[0].length);
    }
  }
  // repeats of names already found, anywhere in the document text
  const done = new Set(out.filter((o) => o.category === 'name').map((o) => o.start + ':' + o.end));
  for (const n of nameSeen) {
    const parts = n.str.split(/\s+/).filter((p) => p.length >= 3 && !/\.$/.test(p));
    const pieces = [{ s: n.str, conf: n.conf, reason: 'repeat of a detected name' }];
    if (parts.length > 1) { const f = parts[0], l = parts[parts.length - 1]; if (FIRST.has(f) || f.length >= 4) pieces.push({ s: f, conf: CONF.possible, reason: 'first name of a detected name' }); if (!NOT_NAME.has(l) && (LAST.has(l) || l.length >= 5)) pieces.push({ s: l, conf: CONF.possible, reason: 'last name of a detected name' }); }
    for (const p of pieces) for (const m of rx(new RegExp('(?<![\\p{L}])' + p.s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'gu'), text)) {
      const k = m.index + ':' + (m.index + p.s.length); if (done.has(k)) continue; done.add(k);
      add('name', p.conf, p.reason, m.index, m.index + p.s.length);
    }
  }
  return resolve(out);
}

// Remove overlaps: prefer more specific categories, then high over possible, then longer spans.
const RANK = { ssn: 9, card: 8, bank: 7, govid: 6, email: 6, dob: 5, phone: 4, address: 3, name: 1 };
function resolve(list) {
  const sorted = list.slice().sort((a, b) => (RANK[b.category] - RANK[a.category]) || ((b.confidence === 'high') - (a.confidence === 'high')) || ((b.end - b.start) - (a.end - a.start)) || (a.start - b.start));
  const kept = [];
  for (const d of sorted) if (!kept.some((k) => k.start < d.end && d.start < k.end)) kept.push(d);
  return kept.sort((a, b) => a.start - b.start);
}

// pages: [{text, rects}]. Names found on one page are propagated to every page (repeat occurrences).
export function detectDocument(pages) {
  const per = pages.map((p) => detectText(p.text));
  const known = new Map();   // name string -> confidence, from all pages
  per.forEach((list, pi) => list.forEach((d) => { if (d.category === 'name' && /^(?:name after|repeat of|first name from)/.test(d.reason)) known.set(pages[pi].text.slice(d.start, d.end), d.reason.startsWith('first name from') ? 'possible' : d.confidence); }));
  const pieces = [];
  for (const [str, conf] of known) {
    pieces.push({ s: str, conf: conf === 'high' ? 'high' : 'possible', reason: 'repeat of a detected name (other page)' });
    const parts = str.split(/\s+/).filter((p) => p.length >= 3 && !/\.$/.test(p));
    if (parts.length > 1) { const f = parts[0], l = parts[parts.length - 1]; if (FIRST.has(f) || f.length >= 4) pieces.push({ s: f, conf: 'possible', reason: 'first name of a detected name' }); if (!NOT_NAME.has(l) && (LAST.has(l) || l.length >= 5)) pieces.push({ s: l, conf: 'possible', reason: 'last name of a detected name' }); }
  }
  per.forEach((list, pi) => {
    const t = pages[pi].text;
    for (const p of pieces) for (const m of rx(new RegExp('(?<![\\p{L}])' + p.s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'gu'), t)) {
      if (!list.some((d) => d.start < m.index + p.s.length && m.index < d.end)) list.push({ category: 'name', confidence: p.conf, reason: p.reason, start: m.index, end: m.index + p.s.length });
    }
    list.sort((a, b) => a.start - b.start);
  });
  const dets = []; let id = 0;
  per.forEach((list, pi) => list.forEach((d) => {
    const p = pages[pi], text = p.text.slice(d.start, d.end);
    dets.push({ id: id++, page: pi, category: d.category, confidence: d.confidence, reason: d.reason, text, start: d.start, end: d.end, rects: p.rects ? rectsFor(p, d.start, d.end) : [] });
  }));
  return dets;
}

// One rectangle per visual line of the match (characters on the same line are merged).
export function rectsFor(page, s, e) {
  const rs = []; let cur = null, A = page.rects;   // rects: array of [x0,y0,x1,y1]|null, or a Float32Array (4 per char, NaN = none)
  const at = (i) => (A instanceof Float32Array ? (Number.isNaN(A[4 * i]) ? null : [A[4 * i], A[4 * i + 1], A[4 * i + 2], A[4 * i + 3]]) : A[i]);
  for (let i = s; i < e; i++) {
    const r = at(i); if (!r || page.text[i] === '\n') { cur = null; continue; }
    if (cur && Math.abs((r[1] + r[3]) / 2 - (cur[1] + cur[3]) / 2) < (cur[3] - cur[1]) * 0.6) { cur[0] = Math.min(cur[0], r[0]); cur[1] = Math.min(cur[1], r[1]); cur[2] = Math.max(cur[2], r[2]); cur[3] = Math.max(cur[3], r[3]); }
    else { cur = r.slice(); rs.push(cur); }
  }
  return rs.map((r) => [r[0] - 1, r[1] - 0.5, r[2] + 1, r[3] + 0.5]);
}
