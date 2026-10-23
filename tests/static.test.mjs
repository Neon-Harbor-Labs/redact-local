// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Neon Harbor Labs. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Static checks: no third-party resources, required links/wording present, no junk or personal data, vendor files pinned and licensed.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), pub = path.join(root, 'public');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const own = walk(pub).filter((f) => !f.includes('/vendor/') && /\.(html|js|css)$/.test(f));
test('our own pages and scripts load nothing from other origins', () => {
  for (const f of own) { const s = fs.readFileSync(f, 'utf8').replace(/<a [^>]*href="https?:[^>]*>/g, '').replace(/\/\/ .*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/(src|href)\s*=\s*["']https?:/i.test(s), f + ' has an external src/href'); assert(!/fetch\(\s*['"`]https?:|XMLHttpRequest|sendBeacon|WebSocket|importScripts\(\s*['"]https?:|import\(\s*['"]https?:/.test(s), f + ' makes an external request'); assert(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(s), f + ' has an inline script'); if (f.endsWith('.html')) assert(!/\son\w+\s*=/i.test(s), f + ' has an inline event handler');
    if (f.endsWith('.js')) { assert(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(s), f + ' uses an HTML-injection or eval API'); assert(!/localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker/.test(s), f + ' stores data in the browser'); } }
});
test('required wording, source link and About page are present', () => {
  const idx = fs.readFileSync(path.join(pub, 'index.html'), 'utf8'), about = fs.readFileSync(path.join(pub, 'about.html'), 'utf8');
  const tag = 'A free, private PDF redaction tool that automatically finds names, addresses, phone numbers and other sensitive information&mdash;even in scanned documents.';
  assert(idx.includes(tag) && about.includes(tag)); assert(/Source code/.test(idx) && /github\.com\/neon-harbor-labs\/redact-local/.test(idx)); assert(/about\.html/.test(idx));
  for (const s of ['processed on this device only', 'Detection can miss information', 'Inspect the result before sharing', 'does <em>not</em> prove that every sensitive item was found']) assert(idx.includes(s), s);
  for (const c of ['MuPDF.js', 'pdf.js', 'Tesseract.js', 'tesseract.js-core', 'compromise', 'AGPL-3.0-or-later', 'Apache-2.0', 'MIT']) assert(about.includes(c), c);
  for (const lic of ['AGPL-3.0.txt', 'mupdf-LICENSE.txt', 'pdfjs-LICENSE.txt', 'tesseractjs-LICENSE.txt', 'tesseract-core-LICENSE.txt', 'tessdata_best-LICENSE.txt', 'compromise-LICENSE.txt', 'NOTICES.txt']) assert(fs.existsSync(path.join(pub, 'licenses', lic)), lic);
  assert(!/overclaim|guarantee(?!s that all)/i.test(idx) || /does not guarantee/i.test(idx));
  assert(!/completely anonym|100% (safe|secure)|guaranteed removal/i.test(idx + about));
});
test('no junk, secrets or personal data in the release', () => {
  const all = walk(root).filter((f) => !f.includes('/public/vendor/') && !f.includes('/tests/out/'));
  assert.deepEqual(all.filter((f) => /(^|\/)\._|\.DS_Store$|\.env(\.|$)|node_modules/.test(f)), []);
  for (const f of all.filter((x) => /\.(md|json|js|mjs|html|css|txt|yml)$/.test(x) && !x.includes('/licenses/') && !x.endsWith('THIRD_PARTY_NOTICES.md') && !x.endsWith('tests/static.test.mjs') && !x.includes('/docs/upstream-'))) { const s = fs.readFileSync(f, 'utf8'); assert(!/rainbroz|\/Users\/|\/Volumes\/|lucidprideai|BEGIN (RSA |EC )?PRIVATE KEY|api[_-]?key\s*[:=]/i.test(s), f); }
});
test('vendored files match their pinned upstream hashes', () => { const r = spawnSync('node', ['tools/check-vendor.mjs'], { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout); });
test('every file fits Cloudflare Pages limits', () => { const r = spawnSync('node', ['tools/size-report.mjs'], { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout); });
