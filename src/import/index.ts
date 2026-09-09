import { parseDelimited, type RawTable } from './parse';
import { readWorkbook } from './sheet';

export * from './parse';
export * from './columns';
export * from './build';
export { PdfPasswordRequired } from './pdf';

export type SourceKind = 'csv' | 'xlsx' | 'pdf' | 'text';

export function sourceKindOf(name: string): SourceKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return 'xlsx';
  if (lower.endsWith('.pdf')) return 'pdf';
  return null;
}

/**
 * Reads a dropped file into a table.
 *
 * `password` is for a locked PDF statement; a call without one that turns out
 * to need one throws PdfPasswordRequired, which the screen catches to ask.
 */
export async function readFile(file: File, password?: string): Promise<RawTable> {
  const kind = sourceKindOf(file.name);
  if (kind === 'xlsx') return readWorkbook(await file.arrayBuffer());
  if (kind === 'csv') return parseDelimited(await file.text());
  if (kind === 'pdf') {
    const { readPdf } = await import('./pdf');
    return readPdf(await file.arrayBuffer(), password);
  }

  if (/\.xls$/i.test(file.name)) {
    throw new Error(
      'That is the old Excel format. Open it and use File → Save As to save a .xlsx or .csv, then try again.',
    );
  }
  throw new Error('Unsupported file. Use a .csv, .xlsx or .pdf file, or paste the rows as text.');
}
