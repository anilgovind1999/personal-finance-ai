import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { DEFAULT_CATEGORIES } from '@/data/categories';
import { buildRows, detectColumns } from './index';
import { readWorkbook } from './sheet';

/** Builds a real .xlsx in memory, so the reader is tested against a true file. */
async function workbook(rows: unknown[][], opts: { cover?: boolean } = {}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  if (opts.cover) wb.addWorksheet('Cover').addRow(['Exported from MyTracker']);
  const ws = wb.addWorksheet('Transactions');
  for (const r of rows) ws.addRow(r);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('reading a real spreadsheet', () => {
  it('reads headers and rows out of an .xlsx file', async () => {
    const buf = await workbook([
      ['Date', 'Description', 'Category', 'Amount'],
      [new Date(2026, 2, 2), 'Swiggy dinner', 'Food & Dining', -486],
      [new Date(2026, 2, 5), 'March salary', 'Salary', 95000],
    ]);
    const table = await readWorkbook(buf);

    expect(table.headers).toEqual(['Date', 'Description', 'Category', 'Amount']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][0]).toBe('2026-03-02');
  });

  it('turns a spreadsheet into transactions', async () => {
    const buf = await workbook([
      ['Date', 'Description', 'Category', 'Amount'],
      [new Date(2026, 2, 2), 'Swiggy dinner', 'Food & Dining', -486],
      [new Date(2026, 2, 5), 'March salary', 'Salary', 95000],
    ]);
    const table = await readWorkbook(buf);
    const { map, dayFirst } = detectColumns(table);
    const rows = buildRows(table, map, { dayFirst, categories: DEFAULT_CATEGORIES, existing: [] });

    expect(rows[0].draft).toMatchObject({
      kind: 'expense', amount: 486, date: '2026-03-02', category: 'Food & Dining',
    });
    expect(rows[1].draft).toMatchObject({ kind: 'income', amount: 95000, category: 'Salary' });
  });

  it('skips a cover sheet and finds the one with data', async () => {
    const buf = await workbook(
      [
        ['Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt'],
        ['02/03/2026', 'UPI-SWIGGY-swiggy@ybl', 486, ''],
      ],
      { cover: true },
    );
    const table = await readWorkbook(buf);
    expect(table.headers).toContain('Narration');
  });

  it('reads the computed result of a formula cell', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.addRow(['Date', 'Description', 'Amount']);
    ws.addRow(['2026-03-02', 'Split dinner', { formula: 'A1', result: -486 }]);
    const table = await readWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(table.rows[0][2]).toBe('-486');
  });
});
