import type { RawTable } from './parse';
import { pagesToTable, type TextItem } from './pdf-layout';

/**
 * Reading a PDF statement.
 *
 * Banks here email statements as PDFs, usually locked with a password built
 * from the account holder's date of birth or PAN, so both the reading and the
 * unlocking have to work or the feature is decorative.
 *
 * pdf.js is loaded only when a PDF is actually opened. It is large, and most
 * people will never import one.
 */

/** Thrown when the file needs a password, or the one given was wrong. */
export class PdfPasswordRequired extends Error {
  constructor(public readonly wrongPassword: boolean) {
    super(
      wrongPassword
        ? 'That password did not open the file.'
        : 'This statement is password protected.',
    );
    this.name = 'PdfPasswordRequired';
  }
}

/** How many pages are read. A year of statements is not worth freezing the tab for. */
const MAX_PAGES = 60;

type PdfModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfModule> | null = null;

async function loadPdfjs(): Promise<PdfModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      // Inlined into the bundle rather than fetched, so this works in the
      // hosted app and in the single-file build alike and needs nothing from
      // the network at the moment someone opens a statement. Both this module
      // and the worker are only fetched when a PDF is actually imported.
      const { default: PdfWorker } = await import('./pdf-worker-factory');
      pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
      return pdfjs;
    })();
  }
  return modulePromise;
}

/** pdf.js reports a needed password by name; anything else is a real failure. */
function isPasswordProblem(err: unknown): { wrong: boolean } | null {
  const e = err as { name?: string; code?: number; message?: string };
  if (e?.name !== 'PasswordException') return null;
  // code 2 is "incorrect", code 1 is "needed".
  return { wrong: e.code === 2 };
}

export async function readPdf(data: ArrayBuffer, password?: string): Promise<RawTable> {
  return readPdfWith(await loadPdfjs(), data, password);
}

/**
 * The reading itself, with pdf.js passed in.
 *
 * Separated so the round-trip test can drive it with the build of pdf.js that
 * runs under Node, and so this file's logic is exercised by tests rather than
 * only by a browser.
 */
export async function readPdfWith(
  pdfjs: Pick<PdfModule, 'getDocument'>,
  data: ArrayBuffer,
  password?: string,
): Promise<RawTable> {
  let doc;
  try {
    doc = await pdfjs.getDocument({
      // pdf.js takes ownership of the buffer, so hand it a copy: the caller may
      // still need the original to retry with a password.
      data: new Uint8Array(data.slice(0)),
      password,
      // Nothing may be fetched at read time — the CSP forbids it and the app
      // promises that a statement never leaves the device.
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
  } catch (err) {
    const pw = isPasswordProblem(err);
    if (pw) throw new PdfPasswordRequired(pw.wrong);
    throw new Error('That PDF could not be opened. It may be damaged.');
  }

  try {
    const pages: string[][][] = [];
    const count = Math.min(doc.numPages, MAX_PAGES);

    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();

      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const t = item as { str: string; transform: number[]; width: number; height: number };
        if (!t.str.trim()) continue;
        items.push({
          text: t.str,
          // transform is [a, b, c, d, e, f]; e and f are the position.
          x: t.transform[4],
          y: t.transform[5],
          width: t.width,
          // Some producers report height 0; the vertical scale is the fallback.
          height: t.height || Math.abs(t.transform[3]) || 10,
        });
      }

      const { pageToRows } = await import('./pdf-layout');
      pages.push(pageToRows(items));
      page.cleanup();
    }

    const table = pagesToTable(pages);
    if (!table.rows.length) {
      throw new Error(
        'No table could be found in that PDF. If it is a scanned image rather than a text statement, ' +
          'it has no text to read — download the CSV version from your bank instead.',
      );
    }
    return table;
  } finally {
    await doc.destroy();
  }
}
