# Neon Harbor Labs integration (proposal - nothing here has been applied)
**Proposed URL:** `https://redact.neonharborlabs.com` (a separate Cloudflare Pages project named `redact-local`; fallback URL `https://redact-local.pages.dev`).

## Why a subdomain and a separate Pages project
- The existing site (`neonharbor-labs-site`) is a Cloudflare Workers static-assets project on the apex domain. Redact Local needs a different, stricter Content-Security-Policy (`wasm-unsafe-eval`, workers) than the site's `_headers`; separate hostnames keep each policy tight.
- Pages with static files only: no Worker script, no AI binding, no KV/R2/D1. It cannot consume the AI quota of any existing Workers project and is not affected by their limits.
- Rolling back or taking the tool down never touches the main site.

## Navigation / project card (to apply later in the site repo)
The site's `src/content/site.ts` defines nav entries and project groups. Suggested entry in the "AI & productivity" group (adapt to the file's actual shape):
```ts
{ title: 'Redact Local', href: 'https://redact.neonharborlabs.com', blurb: 'A free, private PDF redaction tool that automatically finds names, addresses, phone numbers and other sensitive information, even in scanned documents. Runs in your browser; open source (AGPL).', external: true }
```
If you want a top-nav link, add `{ label: 'Redact Local', to: 'https://redact.neonharborlabs.com', key: 'redact', desktop: true }` and make the header render absolute URLs as plain `<a>` elements (the current nav uses in-site routes/anchors). Link text for footers: "Redact Local (open source)" -> the same URL, plus the repository link.
The site's own `_headers` CSP (`default-src 'self'`, `form-action 'self' mailto:`) is unaffected by a plain outbound link.

## Hosting limits (Cloudflare Pages)
Largest file 9.93 MiB (limit 25 MiB); 87 files (limit 20,000); total about 23 MiB. Verified by `npm run check:size`.

## Checklist before announcing
Security review items in docs/SECURITY-REVIEW.md; the mailbox in SECURITY.md exists; the repository URL in `public/index.html` and `public/about.html` is the real one; a legal check of the AGPL obligations (source link visible, notices shipped).
