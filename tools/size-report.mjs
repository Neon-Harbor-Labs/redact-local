// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Cloudflare Pages limits: 25 MiB per file, 20,000 files per deployment. Prints the largest assets and totals.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(pub).map((f) => ({ f: path.relative(pub, f), n: fs.statSync(f).size })).sort((a, b) => b.n - a.n); const LIMIT = 25 * 1048576;
files.slice(0, 12).forEach((x) => console.log((x.n / 1048576).toFixed(2).padStart(7) + ' MiB  ' + x.f));
const total = files.reduce((a, x) => a + x.n, 0); console.log('files:', files.length, '| total ' + (total / 1048576).toFixed(1) + ' MiB | largest ' + (files[0].n / 1048576).toFixed(2) + ' MiB | limit 25 MiB per file / 20,000 files');
const over = files.filter((x) => x.n > LIMIT); const junk = files.filter((x) => /(^|\/)\._|\.DS_Store$/.test(x.f));
if (over.length || junk.length || files.length > 20000) { console.log('FAIL', over.map((x) => x.f), junk.map((x) => x.f)); process.exit(1); } console.log('within Cloudflare Pages limits, no junk files');
