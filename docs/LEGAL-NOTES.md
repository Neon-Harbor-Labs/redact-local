# Legal notes (read before relying on the license information)
**This project has not been legally reviewed or audited.** Everything below was compiled in good faith from the upstream projects' own materials by the project's maintainers and an AI assistant. It is not legal advice.

## What the project does
- Redact Local is released under **AGPL-3.0-or-later** (copyright (C) 2026 Juleus Chapman) because it distributes MuPDF.js (AGPL-3.0-or-later, (C) 2004-2026 Artifex Software, Inc.) as part of the same web application.
- The About page and repository give a visible **Source code** link, the full license texts, and the corresponding source of the bundled MuPDF build (official source archive attached to the v1.0.0 release; git tag and build instructions linked).
- Third-party notices: see THIRD_PARTY_NOTICES.md and public/licenses/.

## Remaining uncertainties (need a lawyer or the upstream owners)
1. **AGPL source offer.** We attach the official archive to the release and link upstream. Whether this meets AGPL sections 6 and 13 for every way users reach the app (e.g. the Cloudflare preview and production hostnames, forks) has not been reviewed.
2. **Binary correspondence.** See docs/SOURCE-CORRESPONDENCE.md: same commit/version/interface, but no rebuild comparison of the .wasm.
3. **Third-party attributions inside MuPDF.js.** The library list is inferred. FreeType: we follow the FreeType License credit clause (election of the FTL rather than GPLv2 is assumed, which suits an AGPL work). jbig2dec is published by Artifex under AGPL; others are permissive (BSD/MIT/zlib/IJG-style/Apache). Texts are included; completeness is unverified.
4. **Tesseract/OCR distribution.** tesseract.js-core's bundled libraries' licenses are included from the commits pinned by that package. The English language data is tessdata_best (Apache-2.0) in an integerized form distributed on npm under an MIT label; this was checked against upstream README statements only.
5. **Copyright holder.** Copyright is attributed to Juleus Chapman personally. No contributor agreement exists. Public brand: Neon Harbor Labs (not a legal entity statement).
6. **Trademarks and patents.** Not assessed. Names "MuPDF", "Artifex", "Tesseract", "pdf.js" belong to their owners.
7. **Privacy law claims.** The tool is described as processing documents locally; no statement about compliance with GDPR/HIPAA or any other law is made or implied.
8. **Logo and typeface (added with the 2026-10 redesign).** The Neon Harbor Labs logo is included in the public repository and the app. It is the publisher's brand asset, and nothing here states whether it is licensed under the AGPL or reserved (a trademark/branding carve-out may be wanted). Poppins is bundled under SIL OFL 1.1 with its license text.
