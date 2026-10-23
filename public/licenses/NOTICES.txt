Redact Local - third-party notices
==================================
Redact Local is free software: GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). See AGPL-3.0.txt.
Source: https://github.com/Neon-Harbor-Labs/redact-local

This site redistributes the following components unmodified. Full license texts are in this folder.

1. MuPDF.js 1.28.1 (WebAssembly build of MuPDF)
   Copyright (C) 2004-2026 Artifex Software, Inc.
   License: GNU AGPL v3 or later (mupdf-LICENSE.txt). Source: https://cgit.ghostscript.com/mupdf.git
   Corresponding source: MuPDF 1.28.1 - official source archive https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz ; git tag 1.28.1 at https://cgit.ghostscript.com/mupdf.git (mirror https://github.com/ArtifexSoftware/mupdf/tree/1.28.1).
   The WebAssembly build scripts are in platform/wasm of that source (BUILDING.md, tools/build.sh, Emscripten 4.0.8).
   Third-party libraries linked into the WASM (evidence: strings in the shipped file + platform/wasm/tools/build.sh): FreeType, HarfBuzz, jbig2dec,
   Little CMS (lcms2), OpenJPEG, libjpeg, gumbo-parser, cmark-gfm, zlib. Their license texts: mupdf-third-party-licenses.txt.
   Portions of this software are copyright (c) 2026 The FreeType Project (www.freetype.org). All rights reserved.
   (Year taken from the bundled FreeType 2.14.3, released 2026-03-22: its source headers read "Copyright (C) 1996-2026".)
   A copy of the source archive is attached to this project's v1.0.0 release: https://github.com/Neon-Harbor-Labs/redact-local/releases/tag/v1.0.0
   (file mupdf-1.28.1-source.tar.gz, SHA-256 dc94c60b2537e2ac9a2d379dd3801545f84a3a302d15c9da358362a1270707c3).
   Artifex also offers a commercial license for MuPDF; Redact Local does not use it.
   Files: vendor/mupdf/mupdf.js, mupdf-wasm.js, mupdf-wasm.wasm

2. pdf.js 6.4.299 - Copyright Mozilla Foundation. License: Apache-2.0 (pdfjs-LICENSE.txt).
   Source: https://github.com/mozilla/pdf.js    Files: vendor/pdfjs/pdf.min.mjs, pdf.worker.min.mjs

3. Tesseract.js 7.0.0 - License: Apache-2.0 (tesseractjs-LICENSE.txt). Source: https://github.com/naptha/tesseract.js
   Its bundles also contain MIT/BSD-3-Clause code (buffer by Feross Aboukhadijeh - MIT; ieee754 - BSD-3-Clause; regenerator-runtime
   (c) Facebook, Inc. - MIT; zlib.js (c) imaya - MIT); see tesseractjs-worker.min.js.LICENSE.txt and tesseractjs-tesseract.min.js.LICENSE.txt.
   Files: vendor/tesseract/tesseract.min.js, worker.min.js

4. tesseract.js-core 7.0.0 - License: Apache-2.0 (tesseract-core-LICENSE.txt). Source: https://github.com/naptha/tesseract.js-core
   A WebAssembly build of Tesseract OCR (Apache-2.0, tesseract-ocr-LICENSE.txt) compiled together with Leptonica, zlib, libtiff,
   giflib, libpng, libjpeg, libwebp and OpenLibm (list taken from the core's .gitmodules and build.sh); their license texts, taken at the commits pinned by
   tesseract.js-core 7.0.0, are in tesseract-core-bundled-libraries.txt.
   This software is based in part on the work of the Independent JPEG Group.
   Files: vendor/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js, tesseract-core-simd-lstm.wasm.js

5. Tesseract English language data, "4.0.0_best_int" from @tesseract.js-data/eng 1.0.0 (integerized "tessdata_best").
   License of the data: Apache-2.0 (tessdata_best-LICENSE.txt, from https://github.com/tesseract-ocr/tessdata_best). The npm packaging is MIT.
   File: vendor/tesseract/eng.traineddata.gz

6. compromise 14.19.0 - Copyright (c) 2026 Spencer Kelly. License: MIT (compromise-LICENSE.txt). Source: https://github.com/spencermountain/compromise
   File: vendor/compromise/compromise-three.mjs

Every vendored file, its exact upstream package, version and SHA-256 are listed in tools/vendor-sources.json and public/vendor/SHA256SUMS.
