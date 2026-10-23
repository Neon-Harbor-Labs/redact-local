// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Neon Harbor Labs. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Re-downloads every vendored file from its pinned npm package via jsDelivr and checks it against the recorded SHA-256 and jsDelivr's own hash.
// Usage: node tools/fetch-vendor.mjs [--hashes-only | --write]   (--hashes-only compares local files with jsDelivr's published SHA-256 without downloading any files)   (without --write it only compares; with --write it replaces local files that differ)
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const src = JSON.parse(fs.readFileSync(path.join(root, 'tools/vendor-sources.json'), 'utf8')); const write = process.argv.includes('--write'),  hashesOnly = process.argv.includes('--hashes-only'); let bad = 0; const lists = {};
for (const [rel, m] of Object.entries(src)) {
  lists[m.package] ||= Object.fromEntries((await (await fetch('https://data.jsdelivr.com/v1/packages/npm/' + m.package + '?structure=flat')).json()).files.map((f) => [f.name, f]));
  const cdnHash = Buffer.from(lists[m.package][m.path].hash, 'base64').toString('hex');
  if (hashesOnly) { const same = cdnHash === m.sha256; if (!same) bad++; console.log(same ? 'ok  ' : 'DIFF', rel, '(' + m.package + ') local sha256 == published', cdnHash.slice(0, 12)); continue; }
  const data = Buffer.from(await (await fetch(m.url)).arrayBuffer()); const h = crypto.createHash('sha256').update(data).digest('hex');
  const same = h === m.sha256 && cdnHash === m.sha256; if (!same) bad++; console.log(same ? 'ok  ' : 'DIFF', rel, '(' + m.package + ')');
  if (!same && write) { fs.writeFileSync(path.join(root, 'public/vendor', rel), data); m.sha256 = h; m.bytes = data.length; }
}
if (write) fs.writeFileSync(path.join(root, 'tools/vendor-sources.json'), JSON.stringify(src, null, 1));
console.log(bad ? bad + ' file(s) differ from the pinned upstream' : 'all vendored files are byte-identical to the pinned upstream packages'); process.exit(bad && !write ? 1 : 0);
