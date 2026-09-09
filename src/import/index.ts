import { parseDelimited, type RawTable } from './parse';
import { readWorkbook } from './sheet';

export * from './parse';
export * from './columns';
export * from './build';

export type SourceKind = 'csv' | 'xlsx' | 'text';

export function sourceKindOf(name: string): SourceKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return 'xlsx';
  return null;
}

/**
 * Reads a dropped file into a table.
 *
 * Old binary .xls and PDF statements are refused by name rather than attempted,
 * because a half-read statement is worse than a clear refusal — the person can
 * re-download as CSV in a minute, and every bank's net banking offers it.
 */
export async function readFile(file: File): Promise<RawTable> {
  const kind = sourceKindOf(file.name);
  if (kind === 'xlsx') return readWorkbook(await file.arrayBuffer());
  if (kind === 'csv') return parseDelimited(await file.text());

  if (/\.xls$/i.test(file.name)) {
    throw new Error(
      'That is the old Excel format. Open it and use File → Save As to save a .xlsx or .csv, then try again.',
    );
  }
  if (/\.pdf$/i.test(file.name)) {
    throw new Error(
      'PDF statements cannot be read directly yet. Download the same statement as CSV or Excel from your bank — every net banking site offers it — or copy the rows and paste them into the box below.',
    );
  }
  throw new Error('Unsupported file. Use a .csv or .xlsx file, or paste the rows as text.');
}
