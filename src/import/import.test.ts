import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/types';
import { DEFAULT_CATEGORIES } from '@/data/categories';
import {
  buildRows, detectColumns, detectDayFirst, parseAmountCell, parseDateCell,
  parseDelimited, summarise,
} from './index';

const OPTS = { dayFirst: true, categories: DEFAULT_CATEGORIES, existing: [] as Transaction[] };

/** An HDFC-style net banking download: preamble, then withdrawal/deposit columns. */
const HDFC = `Account Statement
Account No: XXXXXXXX4417
Period: 01/03/2026 to 31/03/2026

Date,Narration,Chq/Ref No,Value Date,Withdrawal Amt,Deposit Amt,Closing Balance
02/03/2026,UPI-SWIGGY-swiggy@ybl-PAYMENT,000012345678,02/03/2026,486.00,,74514.00
03/03/2026,POS 4417 BIGBASKET BANGALORE,000012345679,03/03/2026,2499.00,,72015.00
05/03/2026,SALARY CREDIT MAR 2026,000012345680,05/03/2026,,95000.00,167015.00
07/03/2026,ATM WDL 4417 KORAMANGALA,000012345681,07/03/2026,5000.00,,162015.00`;

/** A typical third-party tracker export: one signed amount and its own categories. */
const TRACKER = `Date,Description,Category,Amount,Payment Method
2026-03-02,Swiggy dinner,Food & Dining,-486,UPI
2026-03-03,BigBasket weekly shop,Grocery,-2499,Credit Card
2026-03-05,March salary,Salary,95000,Net Banking`;

describe('reading a delimited file', () => {
  it('finds the header row under a statement preamble', () => {
    const table = parseDelimited(HDFC);
    expect(table.headers[0]).toBe('Date');
    expect(table.headers).toContain('Withdrawal Amt');
    expect(table.rows).toHaveLength(4);
  });

  it('keeps a comma that sits inside a quoted description', () => {
    const table = parseDelimited('Date,Description,Amount\n2026-03-02,"Dinner, drinks and cab",-1200');
    expect(table.rows[0][1]).toBe('Dinner, drinks and cab');
    expect(table.rows[0][2]).toBe('-1200');
  });

  it('handles a doubled quote inside a field', () => {
    const table = parseDelimited('Date,Description,Amount\n2026-03-02,"The ""Old"" Cafe",-300');
    expect(table.rows[0][1]).toBe('The "Old" Cafe');
  });

  it('detects a semicolon file without being told', () => {
    const table = parseDelimited('Date;Description;Amount\n02/03/2026;Cafe;-300');
    expect(table.headers).toEqual(['Date', 'Description', 'Amount']);
  });

  it('detects a tab-separated file', () => {
    const table = parseDelimited('Date\tDescription\tAmount\n02/03/2026\tCafe\t-300');
    expect(table.headers).toEqual(['Date', 'Description', 'Amount']);
  });
});

describe('reading a date cell', () => {
  it('reads an ISO date', () => {
    expect(parseDateCell('2026-03-12')).toBe('2026-03-12');
  });

  it('reads Indian day-first dates', () => {
    expect(parseDateCell('12/03/2026')).toBe('2026-03-12');
    expect(parseDateCell('12-03-26')).toBe('2026-03-12');
  });

  it('reads a month name in either position', () => {
    expect(parseDateCell('12-Mar-2026')).toBe('2026-03-12');
    expect(parseDateCell('Mar 12, 2026')).toBe('2026-03-12');
  });

  it('uses the unambiguous half when there is one, whatever the convention', () => {
    // 25 cannot be a month, so this is the 25th however dayFirst is set.
    expect(parseDateCell('25/03/2026', false)).toBe('2026-03-25');
    expect(parseDateCell('03/25/2026', true)).toBe('2026-03-25');
  });

  it('honours the convention when both halves are possible', () => {
    expect(parseDateCell('03/04/2026', true)).toBe('2026-04-03');
    expect(parseDateCell('03/04/2026', false)).toBe('2026-03-04');
  });

  it('rejects a date that does not exist', () => {
    expect(parseDateCell('31/02/2026')).toBeNull();
  });

  it('reads an unformatted Excel serial date', () => {
    expect(parseDateCell('46093')).toBe('2026-03-12');
  });

  it('works out the convention from a column', () => {
    expect(detectDayFirst(['02/03/2026', '25/03/2026'])).toBe(true);
    expect(detectDayFirst(['03/02/2026', '03/25/2026'])).toBe(false);
  });
});

describe('reading a money cell', () => {
  it('strips separators, symbols and currency codes', () => {
    expect(parseAmountCell('₹1,23,456.78')?.amount).toBe(123456.78);
    expect(parseAmountCell('INR 2,499.00')?.amount).toBe(2499);
  });

  it('recognises every way a statement says "money out"', () => {
    expect(parseAmountCell('-486')?.negative).toBe(true);
    expect(parseAmountCell('(486.00)')?.negative).toBe(true);
    expect(parseAmountCell('486.00 Dr')?.negative).toBe(true);
  });

  it('does not read "Cr" as a marker inside a word', () => {
    expect(parseAmountCell('486.00 Cr')?.negative).toBe(false);
    expect(parseAmountCell('not money')).toBeNull();
  });
});

describe('working out what the columns mean', () => {
  it('maps a bank statement with separate in and out columns', () => {
    const table = parseDelimited(HDFC);
    const { map } = detectColumns(table);
    const fields = table.headers.map((_, i) => map[i]);

    expect(fields[table.headers.indexOf('Date')]).toBe('date');
    expect(fields[table.headers.indexOf('Narration')]).toBe('description');
    expect(fields[table.headers.indexOf('Withdrawal Amt')]).toBe('debit');
    expect(fields[table.headers.indexOf('Deposit Amt')]).toBe('credit');
    expect(fields[table.headers.indexOf('Closing Balance')]).toBe('balance');
  });

  it('maps a tracker export with one signed amount', () => {
    const table = parseDelimited(TRACKER);
    const { map } = detectColumns(table);
    expect(map[table.headers.indexOf('Amount')]).toBe('amount');
    expect(map[table.headers.indexOf('Category')]).toBe('category');
    expect(map[table.headers.indexOf('Payment Method')]).toBe('paymentMode');
  });

  it('drops a plain amount column when in/out columns are also present', () => {
    const table = parseDelimited(
      'Date,Narration,Amount,Withdrawal Amt,Deposit Amt\n02/03/2026,Cafe,300,300,',
    );
    const { map, notes } = detectColumns(table);
    expect(map[table.headers.indexOf('Amount')]).toBe('ignore');
    expect(notes.join(' ')).toMatch(/left out/);
  });

  it('says so when it cannot find a date column', () => {
    const table = parseDelimited('Thing,Amount\nCafe,300');
    expect(detectColumns(table).notes.join(' ')).toMatch(/no date column/i);
  });
});

describe('building rows from a bank statement', () => {
  const table = parseDelimited(HDFC);
  const { map, dayFirst } = detectColumns(table);
  const rows = buildRows(table, map, { ...OPTS, dayFirst });

  it('reads every line', () => {
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.draft)).toBe(true);
  });

  it('reads the withdrawal column as an expense', () => {
    expect(rows[0].draft).toMatchObject({ kind: 'expense', amount: 486, date: '2026-03-02' });
  });

  it('reads the deposit column as income', () => {
    expect(rows[2].draft).toMatchObject({ kind: 'income', amount: 95000 });
  });

  it('categorises from the narration, since a statement never says', () => {
    expect(rows[0].draft?.category).toBe('Food & Dining');
    expect(rows[1].draft?.category).toBe('Grocery');
    expect(rows[2].draft?.category).toBe('Salary');
  });

  it('names the merchant from the narration', () => {
    expect(rows[0].draft?.merchant.toLowerCase()).toContain('swiggy');
    expect(rows[1].draft?.merchant.toLowerCase()).toContain('bigbasket');
  });

  it('marks a guessed category, so the screen can flag it', () => {
    expect(rows[0].guessedCategory).toBe(true);
  });
});

describe('building rows from another app’s export', () => {
  const table = parseDelimited(TRACKER);
  const { map, dayFirst } = detectColumns(table);
  const rows = buildRows(table, map, { ...OPTS, dayFirst });

  it('treats a negative amount as money out and a positive as money in', () => {
    expect(rows[0].draft).toMatchObject({ kind: 'expense', amount: 486 });
    expect(rows[2].draft).toMatchObject({ kind: 'income', amount: 95000 });
  });

  it('keeps the categories the other app already had', () => {
    expect(rows[0].draft?.category).toBe('Food & Dining');
    expect(rows[1].draft?.category).toBe('Grocery');
    expect(rows[0].guessedCategory).toBe(false);
  });

  it('reads the payment mode column', () => {
    expect(rows[0].draft?.paymentMode).toBe('UPI');
    expect(rows[1].draft?.paymentMode).toBe('Credit Card');
  });
});

describe('not importing the same money twice', () => {
  const existing: Transaction[] = [
    {
      id: 't1', kind: 'expense', date: '2026-03-03', amount: 2499, merchant: 'BigBasket',
      category: 'Grocery', paymentMode: 'Credit Card', tags: [], attachmentIds: [],
      source: 'manual', createdAt: '', updatedAt: '',
    },
  ];

  it('unticks a row already in the ledger, without discarding it', () => {
    const table = parseDelimited(HDFC);
    const { map, dayFirst } = detectColumns(table);
    const rows = buildRows(table, map, { ...OPTS, dayFirst, existing });

    const repeat = rows.find((r) => r.draft?.amount === 2499)!;
    expect(repeat.duplicateOf).toBe('t1');
    expect(repeat.include).toBe(false);
    expect(repeat.draft).not.toBeNull();
    // Everything else is still selected.
    expect(rows.filter((r) => r.include)).toHaveLength(3);
  });

  it('catches a line the file itself repeats', () => {
    const doubled = `Date,Narration,Withdrawal Amt
02/03/2026,UPI-SWIGGY-swiggy@ybl,486.00
02/03/2026,UPI-SWIGGY-swiggy@ybl,486.00`;
    const table = parseDelimited(doubled);
    const { map, dayFirst } = detectColumns(table);
    const rows = buildRows(table, map, { ...OPTS, dayFirst });
    expect(rows[0].include).toBe(true);
    expect(rows[1].include).toBe(false);
  });

  it('does not confuse two different shops charging the same amount', () => {
    const two = `Date,Narration,Withdrawal Amt
03/03/2026,POS BIGBASKET,2499.00
03/03/2026,POS CROMA ELECTRONICS,2499.00`;
    const table = parseDelimited(two);
    const { map, dayFirst } = detectColumns(table);
    const rows = buildRows(table, map, { ...OPTS, dayFirst, existing });
    expect(rows[1].include).toBe(true);
  });
});

describe('rows that cannot be imported', () => {
  it('explains an unreadable date instead of dropping the row', () => {
    const table = parseDelimited('Date,Narration,Withdrawal Amt\nnot a date,Cafe,300');
    const { map } = detectColumns(table);
    const rows = buildRows(table, map, OPTS);
    expect(rows[0].draft).toBeNull();
    expect(rows[0].problem).toMatch(/could not read the date/i);
    expect(rows[0].include).toBe(false);
  });

  it('skips a statement row that moves no money', () => {
    const table = parseDelimited('Date,Narration,Withdrawal Amt,Deposit Amt\n02/03/2026,OPENING BALANCE,,');
    const { map } = detectColumns(table);
    expect(buildRows(table, map, OPTS)[0].problem).toMatch(/no money/i);
  });
});

describe('the summary shown before importing', () => {
  it('counts and totals what will actually be created', () => {
    const table = parseDelimited(HDFC);
    const { map, dayFirst } = detectColumns(table);
    const s = summarise(buildRows(table, map, { ...OPTS, dayFirst }));

    expect(s.total).toBe(4);
    expect(s.selected).toBe(4);
    expect(s.expenseCount).toBe(3);
    expect(s.incomeCount).toBe(1);
    expect(s.expenseTotal).toBe(486 + 2499 + 5000);
    expect(s.incomeTotal).toBe(95000);
    expect(s.from).toBe('2026-03-02');
    expect(s.to).toBe('2026-03-07');
  });
});
