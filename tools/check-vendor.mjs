// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Neon Harbor Labs. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Verifies every vendored file against tools/vendor-sources.json (SHA-256) and that each has a licence file in public/licenses.
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const src = JSON.parse(fs.readFileSync(path.join(root, 'tools/vendor-sources.json'), 'utf8')); let bad = 0;
for (const [rel, m] of Object.entries(src)) { const d = fs.readFileSync(path.join(root, 'public/vendor', rel)); const h = crypto.createHash('sha256').update(d).digest('hex'); const ok = h === m.sha256 && d.length === m.bytes; if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', rel, m.package); }
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const listed = new Set(Object.keys(src).map((k) => path.join(root, 'public/vendor', k)));
for (const f of walk(path.join(root, 'public/vendor'))) if (!listed.has(f) && !/SHA256SUMS|\.LICENSE\.txt$/.test(f)) { bad++; console.log('FAIL unlisted vendor file', f); }
console.log(bad ? bad + ' problem(s)' : 'vendor files match tools/vendor-sources.json'); process.exit(bad ? 1 : 0);
