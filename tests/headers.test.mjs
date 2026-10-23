// SPDX-License-Identifier: AGPL-3.0-or-later
// Redact Local, Copyright (C) 2026 Juleus Chapman. Free software: see LICENSE (GNU AGPL v3 or later). No warranty.
// Starts the static server (which applies public/_headers like Cloudflare Pages) and checks the REAL HTTP response headers.
import test from 'node:test'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('HTTP response headers satisfy the security policy', async () => {
  const port = 18000 + Math.floor(Math.random() * 1000), srv = spawn('node', ['tools/serve.mjs', '--port', String(port)], { cwd: root, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:' + port + '/'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const code = await new Promise((res) => { const p = spawn('node', ['tools/check-headers.mjs', 'http://127.0.0.1:' + port], { cwd: root, stdio: 'inherit' }); p.on('exit', res); });
    assert.equal(code, 0);
    const r = await fetch('http://127.0.0.1:' + port + '/does-not-exist'); assert.equal(r.status, 404);
  } finally { srv.kill(); }
});
