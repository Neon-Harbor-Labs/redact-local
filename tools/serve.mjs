// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Neon Harbor Labs. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Static server for public/ that applies public/_headers exactly like Cloudflare Pages would (path rules, merged headers).
// Usage: node tools/serve.mjs --port 8788 [--test]   (--test also serves tests/browser at /__tests/ and accepts POST /__report)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), pub = path.join(root, 'public');
const args = process.argv.slice(2), port = +(args[args.indexOf('--port') + 1] || 8788), testMode = args.includes('--test');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.gz': 'application/gzip', '.pdf': 'application/pdf' };

export function parseHeaders(text) {   // Cloudflare "_headers" format: unindented path line, then indented "Name: value" lines
  const rules = []; let cur = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\S/.test(line)) { cur = { pattern: line.trim(), headers: [] }; rules.push(cur); } else if (cur) { const i = line.indexOf(':'); cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
  }
  return rules;
}
const matches = (pat, p) => new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(p);
export function headersFor(rules, p) { const h = new Map(); for (const r of rules) if (matches(r.pattern, p)) for (const [k, v] of r.headers) h.set(k, h.has(k) ? h.get(k) + ', ' + v : v); return h; }

const rules = parseHeaders(fs.readFileSync(path.join(pub, '_headers'), 'utf8'));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); let p = decodeURIComponent(url.pathname);
  if (testMode && req.method === 'POST' && p === '/__report') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { fs.mkdirSync(path.join(root, 'tests/out'), { recursive: true }); fs.writeFileSync(path.join(root, 'tests/out', 'report-' + (url.searchParams.get('id') || 'x') + '.json'), b); res.writeHead(204); res.end(); }); return; }
  let base = pub, rel = p; if (testMode && p.startsWith('/__tests/')) { base = path.join(root, 'tests/browser'); rel = p.slice('/__tests'.length); } else if (testMode && p.startsWith('/__fixtures/')) { base = path.join(root, 'tests/fixtures'); rel = p.slice('/__fixtures'.length); }
  if (rel.endsWith('/')) rel += 'index.html'; const file = path.join(base, rel);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' }); return res.end('Not found'); }
  const hdr = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
  for (const [k, v] of headersFor(rules, p)) hdr[k] = v;
  res.writeHead(200, hdr); fs.createReadStream(file).pipe(res);
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(port, '127.0.0.1', () => console.log('Redact Local on http://127.0.0.1:' + port + '/  (headers from public/_headers' + (testMode ? ', test mode' : '') + ')'));
export { server };
