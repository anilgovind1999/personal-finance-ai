/**
 * Hands back the pdf.js worker constructor.
 *
 * The `?worker&inline` suffix is only honoured on a *static* import, and this
 * module exists so that import can be static while still being loaded lazily:
 * pdf.ts reaches it with `await import(...)`, so nothing here is fetched or
 * parsed until someone actually opens a PDF.
 */
import PdfWorker from './pdf.worker?worker&inline';

export default PdfWorker;
