import { tableFrom, type RawTable } from './parse';

/**
 * Reading a spreadsheet.
 *
 * ExcelJS is already here for the export side, so .xlsx costs no new dependency;
 * it is imported lazily all the same, since most sessions never import anything
 * and the library is large.
 */

/** Formats a cell the way the person saw it in their spreadsheet. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    // A formula cell carries its computed result, which is what matters here.
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(value);
}

export async function readWorkbook(file: ArrayBuffer): Promise<RawTable> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file);

  // The first sheet with data: exports sometimes lead with a cover sheet.
  const sheet = wb.worksheets.find((w) => w.rowCount > 1) ?? wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    // `values` is 1-based with a hole at index 0.
    const values = row.values as unknown[];
    for (let i = 1; i < values.length; i++) cells.push(cellText(values[i]).trim());
    rows.push(cells);
  });

  return tableFrom(rows);
}
