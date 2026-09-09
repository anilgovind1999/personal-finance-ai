import { detectDayFirst, parseAmountCell, parseDateCell, type RawTable } from './parse';

/**
 * Working out what each column of someone else's file means.
 *
 * No two apps or banks agree on column names, so this reads the header where it
 * can and falls back to inspecting the values where it cannot — a column of
 * parseable dates is a date column whatever it calls itself. Every guess is
 * shown to the person before anything is imported, and can be overridden, so
 * the aim here is to be right often enough that the mapping screen is a glance
 * rather than a chore.
 */

export type FieldName =
  | 'date' | 'description' | 'merchant' | 'amount' | 'debit' | 'credit'
  | 'kind' | 'category' | 'subcategory' | 'paymentMode' | 'account'
  | 'balance' | 'remarks' | 'tags' | 'ignore';

/** Column index → what that column holds. */
export type ColumnMap = Record<number, FieldName>;

export const FIELD_LABEL: Record<FieldName, string> = {
  date: 'Date',
  description: 'Description',
  merchant: 'Merchant',
  amount: 'Amount (signed)',
  debit: 'Money out',
  credit: 'Money in',
  kind: 'Income or expense',
  category: 'Category',
  subcategory: 'Subcategory',
  paymentMode: 'Payment mode',
  account: 'Account',
  balance: 'Balance',
  remarks: 'Remarks',
  tags: 'Tags',
  ignore: "Don't import",
};

/** Header patterns, most specific first — "withdrawal amount" must beat "amount". */
const HEADER_RULES: Array<[RegExp, FieldName]> = [
  [/^(withdrawal|debit|dr|paid out|money out|amount out|spent|expense)s?\b|withdrawal/i, 'debit'],
  [/^(deposit|credit|cr|paid in|money in|amount in|received|income)s?\b|deposit/i, 'credit'],
  [/closing|running|\bbalance\b/i, 'balance'],
  [/value date|txn date|transaction date|posting date|^date|\bdate\b/i, 'date'],
  [/narration|particular|description|details|memo|note/i, 'description'],
  [/payee|merchant|vendor|paid to|beneficiary|counterparty/i, 'merchant'],
  [/sub.?category/i, 'subcategory'],
  [/category|expense type|head/i, 'category'],
  [/payment (mode|method)|^mode$|paid (by|via|with)|instrument/i, 'paymentMode'],
  [/account|card|wallet|source/i, 'account'],
  [/income.?expense|direction|debit.?credit|cr.?dr|^type$|^kind$/i, 'kind'],
  [/remark|comment|reference|ref no/i, 'remarks'],
  [/^tags?$|label/i, 'tags'],
  [/amount|^amt|value|^sum$|total/i, 'amount'],
];

const KIND_WORDS = /^(income|expense|debit|credit|dr|cr|in|out|deposit|withdrawal|spent|earned|transfer)$/i;

/** What the values themselves look like, when the header is unhelpful. */
function shapeOf(values: string[]): 'date' | 'money' | 'kind' | 'text' | 'empty' {
  const filled = values.filter((v) => v.trim() !== '');
  if (!filled.length) return 'empty';
  const hit = (fn: (v: string) => boolean) => filled.filter(fn).length / filled.length;

  if (hit((v) => parseDateCell(v) !== null) > 0.8) return 'date';
  if (hit((v) => KIND_WORDS.test(v.trim())) > 0.8) return 'kind';
  if (hit((v) => parseAmountCell(v) !== null) > 0.8) return 'money';
  return 'text';
}

function columnValues(table: RawTable, index: number): string[] {
  return table.rows.map((r) => r[index] ?? '');
}

export interface Detection {
  map: ColumnMap;
  /** Whether ambiguous numeric dates in the date column were read day-first. */
  dayFirst: boolean;
  /** What the detector wants the person to check, in their own words. */
  notes: string[];
}

/**
 * Guesses a column mapping for a table.
 *
 * Headers are trusted first, because a file that says "Withdrawal Amt" means it.
 * Columns the headers do not explain are then filled in from the shape of their
 * values, and a few sanity rules run at the end: exactly one date column, and
 * either one signed amount or a money-out/money-in pair, never both.
 */
export function detectColumns(table: RawTable): Detection {
  const map: ColumnMap = {};
  const notes: string[] = [];
  const taken = new Set<FieldName>();

  const claim = (i: number, field: FieldName) => {
    map[i] = field;
    if (field !== 'ignore') taken.add(field);
  };

  table.headers.forEach((header, i) => {
    const h = header.trim();
    if (!h) return;
    for (const [pattern, field] of HEADER_RULES) {
      if (!pattern.test(h)) continue;
      // A second "date" column is the value date; the first one wins.
      if (taken.has(field)) return;
      claim(i, field);
      return;
    }
  });

  // Anything the header did not explain, read from the values.
  table.headers.forEach((_, i) => {
    if (map[i]) return;
    const shape = shapeOf(columnValues(table, i));
    if (shape === 'date' && !taken.has('date')) claim(i, 'date');
    else if (shape === 'kind' && !taken.has('kind')) claim(i, 'kind');
    else if (shape === 'money' && !taken.has('amount') && !taken.has('debit')) claim(i, 'amount');
    else if (shape === 'text' && !taken.has('description')) claim(i, 'description');
    else map[i] = 'ignore';
  });

  // A "type" column holding category words is a category, not a direction.
  for (const [i, field] of Object.entries(map)) {
    if (field !== 'kind') continue;
    if (shapeOf(columnValues(table, Number(i))) !== 'kind') {
      map[Number(i)] = taken.has('category') ? 'ignore' : 'category';
      taken.delete('kind');
    }
  }

  // A signed amount and a debit/credit pair are two ways of saying the same
  // thing. Keeping both would double-count, so the pair wins: it is unambiguous.
  if (taken.has('amount') && (taken.has('debit') || taken.has('credit'))) {
    for (const [i, field] of Object.entries(map)) {
      if (field === 'amount') map[Number(i)] = 'ignore';
    }
    taken.delete('amount');
    notes.push('This file has separate money-in and money-out columns, so the plain "amount" column was left out.');
  }

  const dateIndex = Object.entries(map).find(([, f]) => f === 'date')?.[0];
  const dayFirst = dateIndex ? detectDayFirst(columnValues(table, Number(dateIndex))) : true;

  if (!taken.has('date')) notes.push('No date column was recognised — choose one below.');
  if (!taken.has('amount') && !taken.has('debit') && !taken.has('credit')) {
    notes.push('No amount column was recognised — choose one below.');
  }
  if (dateIndex && dayFirst) {
    notes.push('Dates are being read day first (12/03 is 12 March). Change the column if that is wrong.');
  }

  return { map, dayFirst, notes };
}
