import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DEFAULT_CATEGORIES } from '@/data/categories';
import { buildRows, detectColumns } from './index';
import { readPdfWith } from './pdf';

/**
 * A genuine PDF, produced and then read back.
 *
 * The geometry tests above use coordinates written by hand, which proves the
 * reasoning but not that a real file arrives in the shape it expects. This
 * builds an actual statement — the same way the app builds its own PDF reports —
 * and puts it through the real pdf.js.
 */
function statement(opts: { password?: string } = {}): ArrayBuffer {
  const doc = new jsPDF({ encryption: opts.password ? { userPassword: opts.password } : undefined });

  doc.setFontSize(13);
  doc.text('Statement of Account', 14, 16);
  doc.setFontSize(9);
  doc.text('Account No: XXXXXXXX4417', 14, 23);
  doc.text('Period: 01/03/2026 to 31/03/2026', 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance']],
    body: [
      ['02/03/2026', 'UPI-SWIGGY-swiggy@ybl', '486.00', '', '74,514.00'],
      ['03/03/2026', 'POS 4417 BIGBASKET BANGALORE', '2,499.00', '', '72,015.00'],
      ['05/03/2026', 'SALARY CREDIT MAR 2026', '', '95,000.00', '167,015.00'],
      ['09/03/2026', 'NETFLIX SUBSCRIPTION', '649.00', '', '166,366.00'],
    ],
    styles: { fontSize: 8 },
  });

  return doc.output('arraybuffer');
}

describe('reading a genuine PDF statement', () => {
  it('recovers the table, including which column each figure was in', async () => {
    const table = await readPdfWith(pdfjs, statement());

    expect(table.headers).toEqual(expect.arrayContaining(['Date', 'Narration', 'Withdrawal', 'Deposit']));
    expect(table.rows).toHaveLength(4);

    const withdrawalAt = table.headers.indexOf('Withdrawal');
    const depositAt = table.headers.indexOf('Deposit');
    expect(table.rows[0][withdrawalAt]).toBe('486.00');
    expect(table.rows[0][depositAt]).toBe('');
    expect(table.rows[2][depositAt]).toBe('95,000.00');
    expect(table.rows[2][withdrawalAt]).toBe('');
  });

  it('becomes correctly signed transactions', async () => {
    const table = await readPdfWith(pdfjs, statement());
    const { map, dayFirst } = detectColumns(table);
    const rows = buildRows(table, map, { dayFirst, categories: DEFAULT_CATEGORIES, existing: [] });

    expect(rows).toHaveLength(4);
    expect(rows[0].draft).toMatchObject({ kind: 'expense', amount: 486, date: '2026-03-02' });
    expect(rows[1].draft).toMatchObject({ kind: 'expense', amount: 2499, category: 'Grocery' });
    expect(rows[2].draft).toMatchObject({ kind: 'income', amount: 95000, category: 'Salary' });
    expect(rows[3].draft).toMatchObject({ kind: 'expense', amount: 649 });
  });

  it('does not mistake the balance column for the amount', async () => {
    const table = await readPdfWith(pdfjs, statement());
    const { map } = detectColumns(table);
    expect(map[table.headers.indexOf('Balance')]).toBe('balance');
  });

  it('asks for a password rather than failing obscurely', async () => {
    await expect(readPdfWith(pdfjs, statement({ password: 'GOVI1234' }))).rejects.toMatchObject({
      name: 'PdfPasswordRequired',
      wrongPassword: false,
    });
  });

  it('says so when the password is wrong', async () => {
    await expect(readPdfWith(pdfjs, statement({ password: 'GOVI1234' }), 'nope')).rejects.toMatchObject({
      name: 'PdfPasswordRequired',
      wrongPassword: true,
    });
  });

  it('opens the statement once the right password is given', async () => {
    const table = await readPdfWith(pdfjs, statement({ password: 'GOVI1234' }), 'GOVI1234');
    expect(table.rows).toHaveLength(4);
  });
});
