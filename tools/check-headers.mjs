// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Checks the REAL HTTP response headers (not the HTML) of a running site. Usage: node tools/check-headers.mjs https://your-site.example
const base = (process.argv[2] || 'http://127.0.0.1:8788').replace(/\/$/, ''); let bad = 0;
const must = { 'x-content-type-options': /^nosniff$/i, 'referrer-policy': /^no-referrer$/i, 'x-frame-options': /^deny$/i, 'cross-origin-opener-policy': /^same-origin$/i, 'cross-origin-resource-policy': /^same-origin$/i, 'permissions-policy': /camera=\(\)/, 'content-security-policy': null };
const cspMust = [/default-src 'none'/, /script-src 'self' 'wasm-unsafe-eval'/, /worker-src 'self'/, /connect-src 'self'/, /frame-ancestors 'none'/, /base-uri 'none'/, /form-action 'none'/, /object-src 'none'/];
const cspForbid = [/unsafe-inline/, /unsafe-eval(?!')/, /https?:/, /\*/, /script-src[^;]*data:/];
const paths = ['/', '/index.html', '/about.html', '/js/app.js', '/js/worker.js', '/vendor/mupdf/mupdf-wasm.wasm', '/vendor/pdfjs/pdf.worker.min.mjs', '/vendor/tesseract/worker.min.js', '/vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', '/vendor/tesseract/eng.traineddata.gz', '/licenses/AGPL-3.0.txt'];
const ctype = { '.wasm': /^application\/wasm/, '.js': /javascript/, '.mjs': /javascript/, '.html': /^text\/html/, '.gz': /^(application\/gzip|application\/x-gzip|application\/octet-stream|application\/x-gunzip)/ };
// Follows only same-origin redirects (e.g. Cloudflare's clean-URL 307 /index.html -> /), at most 3 hops; anything else is left as a non-200 and fails.
async function get(p) {
  let url = new URL(base + p), hops = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { redirect: 'manual' });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      const next = new URL(loc, url); await r.arrayBuffer();
      if (next.origin !== new URL(base).origin) { bad++; console.log('FAIL', p + ' redirects to another origin: ' + next.origin); return r; }
      hops.push(r.status + ' ' + next.pathname); url = next; continue;
    }
    r.hops = hops; return r;
  }
  bad++; console.log('FAIL', p + ' too many redirects'); const r = await fetch(url); r.hops = hops; return r;
}
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
for (const p of paths) {
  const r = await get(p); const h = r.headers;
  ok(r.status === 200, p + ' -> HTTP ' + r.status + (r.hops.length ? ' (via ' + r.hops.join(' > ') + ')' : ''));
  for (const [k, re] of Object.entries(must)) { const v = h.get(k); ok(v && (!re || re.test(v)), p + '  ' + k + (v ? ': ' + v.slice(0, 60) : ' MISSING')); }
  const csp = h.get('content-security-policy') || ''; if (p === '/') { cspMust.forEach((re) => ok(re.test(csp), 'CSP has ' + re)); cspForbid.forEach((re) => ok(!re.test(csp), 'CSP lacks ' + re)); }
  const ext = p.slice(p.lastIndexOf('.')); if (ctype[ext]) ok(ctype[ext].test(h.get('content-type') || ''), p + '  content-type ' + h.get('content-type'));
  ok(!h.get('content-encoding') || p.endsWith('.gz') === false, p + '  content-encoding ' + (h.get('content-encoding') || 'none') + (p.endsWith('.gz') ? ' (must not be set for the .gz language data)' : ''));
  ok(!h.get('set-cookie'), p + '  no cookies set'); await r.arrayBuffer();
}
console.log(bad ? '\n' + bad + ' problem(s)' : '\nAll header checks passed for ' + base); process.exit(bad ? 1 : 0);
