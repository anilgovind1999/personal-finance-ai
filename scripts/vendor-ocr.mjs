/**
 * Copies the Tesseract OCR runtime out of node_modules and into public/tesseract/.
 *
 * By default tesseract.js pulls its worker, WASM core and language data from a
 * public CDN at run time. That would make the receipt scanner fail offline,
 * put a third party in the request path of a finance app, and break under any
 * strict Content-Security-Policy. Serving the same files ourselves fixes all
 * three, and keeps the binaries out of git — they are copied at install and
 * build time from packages we already depend on.
 */
import { mkdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'tesseract');

const ASSETS = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // getCore() picks the SIMD build where the browser supports it and falls back
  // to the plain one, so both have to be present. Each file embeds its own WASM.
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  // The LSTM-only engine uses the "best_int" trained data — a third of the size
  // of the full model, with no accuracy cost for the engine we actually run.
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

let copied = 0;
let bytes = 0;

for (const [from, to] of ASSETS) {
  const src = path.join(root, from);
  const dest = path.join(out, to);
  if (!existsSync(src)) {
    console.error(`vendor-ocr: missing ${from} — run npm install first.`);
    process.exit(1);
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  bytes += (await stat(dest)).size;
  copied += 1;
}

console.log(`vendor-ocr: ${copied} OCR assets staged in public/tesseract (${(bytes / 1048576).toFixed(1)} MB)`);
