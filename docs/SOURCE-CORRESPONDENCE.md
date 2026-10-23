# MuPDF.js 1.28.1: source and build correspondence
Redact Local ships the **unmodified** WebAssembly build from the npm package `mupdf@1.28.1` (`public/vendor/mupdf/mupdf.js`, `mupdf-wasm.js`, `mupdf-wasm.wasm`; SHA-256 values in `tools/vendor-sources.json`).

## Corresponding source we provide
- Official MuPDF 1.28.1 source archive: https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz
  (68,898,834 bytes, SHA-256 `dc94c60b2537e2ac9a2d379dd3801545f84a3a302d15c9da358362a1270707c3`, 8,688 entries, gzip integrity checked).
  The archive is attached unchanged to this repository's v1.0.0 GitHub release as `mupdf-1.28.1-source.tar.gz`.
- Git: tag `1.28.1` = commit `20061bd45183f5a2bff8f43675e4da91e5ac2901` at https://cgit.ghostscript.com/mupdf.git (mirror https://github.com/ArtifexSoftware/mupdf).
- The MuPDF.js/WebAssembly build scripts are in `platform/wasm/` of that source (`BUILDING.md`, `tools/build.sh`; Emscripten 4.0.8, Node LTS).

## What was verified (authoritative upstream evidence)
| Check | Result |
|---|---|
| npm `mupdf@1.28.1` registry metadata `gitHead` vs the 1.28.1 git tag | both `20061bd45183f5a2bff8f43675e4da91e5ac2901` (identical) |
| `include/mupdf/fitz/version.h` in the archive | `FZ_VERSION "1.28.1"` |
| `platform/wasm/package.json` in the archive | name `mupdf`, version `1.28.1`, license `AGPL-3.0-or-later` |
| version string inside the shipped `.wasm` | contains "MuPDF 1.28.1" |
| WebAssembly interface: `platform/wasm/lib/mupdf.c` preprocessed and run through the build's own `tools/make-wasm-type.js` (the build.sh TYPESCRIPT step, with clang instead of emcc for the preprocessing) vs `dist/mupdf-wasm.d.ts` in the npm package | **byte-identical** (46,426 bytes) |
| `platform/wasm/tools/build.sh` default features | `brotli=no mujs=no extract=no xps=no svg=no`; links `libmupdf.a` + `libmupdf-third.a` |
| Third-party libraries found as code in the shipped `.wasm` (string evidence) | FreeType, HarfBuzz, jbig2dec, Little CMS, OpenJPEG, libjpeg, gumbo-parser, cmark, zlib; no MuJS, Tesseract, Leptonica, zxing, zint |
| Their licence texts | fetched from the commits pinned by the 1.28.1 tag (`public/licenses/mupdf-third-party-licenses.txt`) |
| FreeType version and year | FreeType 2.14.3 (2026-03-22); headers read "Copyright (C) 1996-2026" -> credit year 2026 |

## What could NOT be confirmed
- **Bit-for-bit reproducibility of `mupdf-wasm.wasm`.** Rebuilding needs Linux with Emscripten 4.0.8 and the TypeScript toolchain; it was not attempted. The evidence above shows the package corresponds to the 1.28.1 source (same commit, same version, identical generated interface), not that a rebuild would produce identical bytes.
- **Exact list of linked third-party libraries.** It is inferred from the build script defaults and strings in the binary; Artifex does not publish a manifest for the npm artifact.
- Whether a user-facing link to Artifex-hosted source is sufficient under AGPL section 6 by itself (we also attach the archive to our release). See LEGAL-NOTES.md.
