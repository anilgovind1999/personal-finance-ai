import type { CategoryDef, PaymentMode, Transaction, TxnKind } from '@/types';
import { findPaymentMode, guessMerchantFromText, findMerchant, scoreCategories } from '@/engine/parser';
import { merchantAffinity } from '@/engine/reconcile';
import { round2 } from '@/lib/utils';
import { parseAmountCell, parseDateCell, type RawTable } from './parse';
import type { ColumnMap } from './columns';

/**
 * Turning a mapped table into transactions the person can check.
 *
 * Nothing here writes to the ledger. It produces one row per line of the file,
 * each either a proposed transaction or a stated reason why it cannot be one,
 * so the import screen can show the whole thing before a single entry is
 * created. Rows that look like money already recorded are marked, because
 * re-importing an overlapping statement is the obvious way to double a ledger.
 */

export interface ImportDraft {
  kind: TxnKind;
  date: string;
  amount: number;
  merchant: string;
  category: string;
  subcategory?: string;
  paymentMode: PaymentMode;
  remarks?: string;
  tags: string[];
}

export interface ImportRow {
  /** Position in the file, for a message the person can act on. */
  line: number;
  draft: ImportDraft | null;
  /** Why this row cannot be imported, when it cannot. */
  problem?: string;
  /** An existing ledger entry this row appears to repeat. */
  duplicateOf?: string;
  /** Whether this row is selected for import. */
  include: boolean;
  /** True when the category was inferred rather than read from the file. */
  guessedCategory: boolean;
}

export interface BuildOptions {
  dayFirst: boolean;
  categories: CategoryDef[];
  /** The ledger as it stands, for spotting rows that are already recorded. */
  existing: Transaction[];
}

const PAYMENT_WORDS: Array<[RegExp, PaymentMode]> = [
  [/credit\s*card|\bcc\b/i, 'Credit Card'],
  [/debit\s*card|atm/i, 'Debit Card'],
  [/upi|vpa|@[a-z]/i, 'UPI'],
  [/net\s*bank|neft|imps|rtgs|transfer/i, 'Net Banking'],
  [/wallet|paytm|phonepe|mobikwik/i, 'Wallet'],
  [/cash|withdrawal/i, 'Cash'],
];

function readPaymentMode(cell: string | undefined, description: string): PaymentMode {
  if (cell) {
    for (const [pattern, mode] of PAYMENT_WORDS) if (pattern.test(cell)) return mode;
  }
  const fromText = findPaymentMode(description);
  if (fromText) return fromText.value;
  for (const [pattern, mode] of PAYMENT_WORDS) if (pattern.test(description)) return mode;
  return 'Net Banking';
}

/** Matches a category name from the file to one this app knows, loosely. */
function matchCategory(cell: string, categories: CategoryDef[], kind: TxnKind): string | null {
  const want = cell.trim().toLowerCase();
  if (!want) return null;
  const pool = categories.filter((c) => c.kind === kind || c.name === 'Transfers');
  const exact = pool.find((c) => c.name.toLowerCase() === want);
  if (exact) return exact.name;
  const loose = pool.find(
    (c) => c.name.toLowerCase().includes(want) || want.includes(c.name.toLowerCase().split('/')[0].split(' ')[0]),
  );
  return loose?.name ?? null;
}

const INDEX_OF = (map: ColumnMap, field: string): number | undefined => {
  const hit = Object.entries(map).find(([, f]) => f === field);
  return hit ? Number(hit[0]) : undefined;
};

const KIND_IN = /^(income|credit|cr|in|deposit|received|earned)$/i;

/**
 * Decides an entry's direction and size.
 *
 * The three conventions — a money-out/money-in pair, a signed amount, or an
 * explicit direction column — are all in circulation, so all three are read and
 * the first one the file actually provides is used.
 */
function readAmount(
  cells: string[],
  map: ColumnMap,
): { kind: TxnKind; amount: number } | { problem: string } {
  const debitAt = INDEX_OF(map, 'debit');
  const creditAt = INDEX_OF(map, 'credit');

  if (debitAt !== undefined || creditAt !== undefined) {
    const out = debitAt !== undefined ? parseAmountCell(cells[debitAt] ?? '') : null;
    const inn = creditAt !== undefined ? parseAmountCell(cells[creditAt] ?? '') : null;
    if (out && out.amount > 0) return { kind: 'expense', amount: out.amount };
    if (inn && inn.amount > 0) return { kind: 'income', amount: inn.amount };
    return { problem: 'No money in or out on this row' };
  }

  const amountAt = INDEX_OF(map, 'amount');
  if (amountAt === undefined) return { problem: 'No amount column' };
  const parsed = parseAmountCell(cells[amountAt] ?? '');
  if (!parsed || parsed.amount === 0) return { problem: 'The amount could not be read' };

  const kindAt = INDEX_OF(map, 'kind');
  if (kindAt !== undefined && (cells[kindAt] ?? '').trim()) {
    return { kind: KIND_IN.test(cells[kindAt].trim()) ? 'income' : 'expense', amount: parsed.amount };
  }
  // With no direction column, a negative number is money leaving.
  return { kind: parsed.negative ? 'expense' : 'income', amount: parsed.amount };
}

/**
 * Whether this row is money the ledger already holds.
 *
 * Imports are re-run — a month is downloaded twice, or two statements overlap —
 * so the same date and the same amount is treated as a repeat unless the
 * descriptions actively disagree. The row is not discarded; it is unticked, and
 * the person can tick it back on.
 */
function findDuplicate(draft: ImportDraft, existing: Transaction[]): string | undefined {
  for (const t of existing) {
    if (t.date !== draft.date) continue;
    if (t.kind !== draft.kind) continue;
    if (Math.abs(t.amount - draft.amount) > 0.5) continue;
    if (merchantAffinity(draft.merchant, t.merchant) < 0) continue;
    return t.id;
  }
  return undefined;
}

export function buildRows(table: RawTable, map: ColumnMap, options: BuildOptions): ImportRow[] {
  const { dayFirst, categories, existing } = options;
  const dateAt = INDEX_OF(map, 'date');
  const descAt = INDEX_OF(map, 'description');
  const merchantAt = INDEX_OF(map, 'merchant');
  const categoryAt = INDEX_OF(map, 'category');
  const subAt = INDEX_OF(map, 'subcategory');
  const modeAt = INDEX_OF(map, 'paymentMode');
  const remarkAt = INDEX_OF(map, 'remarks');
  const tagAt = INDEX_OF(map, 'tags');

  // Rows accumulate as they are built, so a file that repeats a line inside
  // itself is caught as well as one that repeats the ledger.
  const seen: Transaction[] = [...existing];

  return table.rows.map((cells, i) => {
    const line = i + 1;
    const blank: ImportRow = { line, draft: null, include: false, guessedCategory: false };

    if (dateAt === undefined) return { ...blank, problem: 'No date column' };
    const date = parseDateCell(cells[dateAt] ?? '', dayFirst);
    if (!date) return { ...blank, problem: `Could not read the date “${cells[dateAt] ?? ''}”` };

    const money = readAmount(cells, map);
    if ('problem' in money) return { ...blank, problem: money.problem };

    const description = (descAt !== undefined ? cells[descAt] : '') ?? '';
    const merchantCell = (merchantAt !== undefined ? cells[merchantAt] : '') ?? '';
    const text = `${description} ${merchantCell}`;
    const known = findMerchant(text);
    const merchant =
      merchantCell.trim() ||
      known?.value ||
      guessMerchantFromText(description)?.value ||
      description.trim().slice(0, 40) ||
      'Unknown merchant';

    // The file's own category is taken at its word. Failing that, a merchant the
    // app recognises carries its category with it — a statement narration says
    // "UPI-SWIGGY-…" and nothing else about what the money bought — and only
    // then does keyword scoring get a turn.
    const fromFile = categoryAt !== undefined ? matchCategory(cells[categoryAt] ?? '', categories, money.kind) : null;
    const scored = scoreCategories(text, money.kind)[0];
    const fromMerchant = known && known.entry.category !== 'Other' ? known.entry.category : null;
    const category =
      fromFile ??
      fromMerchant ??
      (scored && scored.score > 0 ? scored.category : money.kind === 'income' ? 'Other Income' : 'Other');
    const subFromMerchant = !fromFile && fromMerchant ? known?.entry.subcategory : undefined;

    const draft: ImportDraft = {
      kind: money.kind,
      date,
      amount: round2(money.amount),
      merchant,
      category,
      subcategory: (subAt !== undefined ? (cells[subAt] ?? '').trim() || undefined : undefined) ?? subFromMerchant,
      paymentMode: readPaymentMode(modeAt !== undefined ? cells[modeAt] : undefined, `${description} ${merchantCell}`),
      remarks: remarkAt !== undefined ? (cells[remarkAt] ?? '').trim() || undefined : description.trim() || undefined,
      tags: tagAt !== undefined ? (cells[tagAt] ?? '').split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
    };

    const duplicateOf = findDuplicate(draft, seen);
    if (!duplicateOf) {
      seen.push({ ...draft, id: `import-${line}` } as Transaction);
    }

    return {
      line,
      draft,
      duplicateOf,
      // A repeat starts unticked; everything else is imported unless unticked.
      include: !duplicateOf,
      guessedCategory: !fromFile,
    };
  });
}

/** A short account of what an import will do, for the confirm step. */
export function summarise(rows: ImportRow[]) {
  const included = rows.filter((r) => r.include && r.draft);
  const expense = included.filter((r) => r.draft!.kind === 'expense');
  const income = included.filter((r) => r.draft!.kind === 'income');
  const dates = included.map((r) => r.draft!.date).sort();
  return {
    total: rows.length,
    selected: included.length,
    skipped: rows.filter((r) => !r.include).length,
    failed: rows.filter((r) => !r.draft).length,
    duplicates: rows.filter((r) => r.duplicateOf).length,
    guessed: included.filter((r) => r.guessedCategory).length,
    expenseCount: expense.length,
    incomeCount: income.length,
    expenseTotal: round2(expense.reduce((a, r) => a + r.draft!.amount, 0)),
    incomeTotal: round2(income.reduce((a, r) => a + r.draft!.amount, 0)),
    from: dates[0],
    to: dates[dates.length - 1],
  };
}
