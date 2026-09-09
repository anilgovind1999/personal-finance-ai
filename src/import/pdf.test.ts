import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '@/data/categories';
import { buildRows, detectColumns } from './index';
import { groupLines, joinItems, pageToRows, pagesToTable, type TextItem } from './pdf-layout';

/** Text placed the way a PDF places it: a baseline, a left edge, a width. */
const at = (text: string, x: number, y: number, width = text.length * 4.5): TextItem =>
  ({ text, x, y, width, height: 9 });

describe('finding the lines of a page', () => {
  it('groups text sharing a baseline, in reading order', () => {
    const lines = groupLines([at('Amount', 400, 700), at('Date', 40, 700), at('02/03/2026', 40, 680)]);
    expect(lines).toHaveLength(2);
    expect(lines[0].map((i) => i.text)).toEqual(['Date', 'Amount']);
  });

  it('tolerates a baseline off by a point, as a different font size leaves it', () => {
    const lines = groupLines([at('Date', 40, 700), at('Amount', 400, 701.5)]);
    expect(lines).toHaveLength(1);
  });

  it('keeps genuinely separate lines apart', () => {
    expect(groupLines([at('Date', 40, 700), at('02/03/2026', 40, 688)])).toHaveLength(2);
  });
});

describe('joining the runs of text inside one column', () => {
  it('rejoins runs that are halves of one word', () => {
    // A producer may emit "UPI" and "-SWIGGY" as separate runs, touching.
    expect(joinItems([at('UPI', 40, 700, 12), at('-SWIGGY', 52, 700, 30)])).toBe('UPI-SWIGGY');
  });

  it('puts a space back where the gap held one', () => {
    expect(joinItems([at('March', 40, 700, 24), at('salary', 68, 700, 26)])).toBe('March salary');
  });

  it('is empty for a column this row said nothing in', () => {
    expect(joinItems([])).toBe('');
  });
});

describe('finding the columns of a page', () => {
  /** A statement where the third row has no deposit and the fourth no withdrawal. */
  const page: TextItem[] = [
    at('Date', 40, 700), at('Narration', 110, 700), at('Withdrawal', 330, 700), at('Deposit', 430, 700),
    at('02/03/2026', 40, 686), at('UPI-SWIGGY', 110, 686), at('486.00', 340, 686),
    at('03/03/2026', 40, 672), at('POS BIGBASKET', 110, 672), at('2499.00', 336, 672),
    at('05/03/2026', 40, 658), at('SALARY CREDIT', 110, 658), at('95000.00', 432, 658),
  ];

  it('keeps money out and money in in different columns', () => {
    const rows = pageToRows(page);
    expect(rows[0]).toEqual(['Date', 'Narration', 'Withdrawal', 'Deposit']);
    // The withdrawal rows leave the deposit cell empty, and the reverse.
    expect(rows[1]).toEqual(['02/03/2026', 'UPI-SWIGGY', '486.00', '']);
    expect(rows[3]).toEqual(['05/03/2026', 'SALARY CREDIT', '', '95000.00']);
  });

  it('reads that page as a table with the right columns', () => {
    const table = pagesToTable([pageToRows(page)]);
    expect(table.headers).toEqual(['Date', 'Narration', 'Withdrawal', 'Deposit']);
    expect(table.rows).toHaveLength(3);
  });

  it('becomes transactions with the right direction', () => {
    const table = pagesToTable([pageToRows(page)]);
    const { map, dayFirst } = detectColumns(table);
    const rows = buildRows(table, map, { dayFirst, categories: DEFAULT_CATEGORIES, existing: [] });

    expect(rows[0].draft).toMatchObject({ kind: 'expense', amount: 486, date: '2026-03-02' });
    expect(rows[2].draft).toMatchObject({ kind: 'income', amount: 95000 });
  });

  it('drops the header where it repeats on the second page', () => {
    const table = pagesToTable([pageToRows(page), pageToRows(page)]);
    expect(table.rows).toHaveLength(6);
    expect(table.rows.every((r) => r[0] !== 'Date')).toBe(true);
  });

  it('lets a page number make its own empty column rather than corrupting a row', () => {
    const rows = pageToRows([...page, at('Page 1 of 3', 250, 40)]);
    const header = rows[0];
    // The footer adds a column of its own, which the mapping step ignores; what
    // matters is that the money did not move sideways into another column.
    const withdrawalAt = header.indexOf('Withdrawal');
    const depositAt = header.indexOf('Deposit');
    expect(rows[1][withdrawalAt]).toBe('486.00');
    expect(rows[1][depositAt]).toBe('');
    expect(rows[3][depositAt]).toBe('95000.00');
    expect(rows[3][withdrawalAt]).toBe('');
  });
});
