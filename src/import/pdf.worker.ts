/**
 * The pdf.js worker, wrapped so Vite bundles it as one.
 *
 * Importing `pdfjs-dist/.../pdf.worker.min.mjs?worker` directly does not work:
 * Vite leaves the query on a package path alone and emits an ordinary module,
 * which then fails at `new Worker()` — silently, at the moment someone opens a
 * statement. A one-line local module carries the suffix reliably.
 */
import 'pdfjs-dist/build/pdf.worker.min.mjs';
