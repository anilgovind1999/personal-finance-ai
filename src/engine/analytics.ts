import type { Account, Transaction } from '@/types';
import { SAVINGS_LIKE_CATEGORIES, TRANSFER_CATEGORIES } from '@/data/categories';
import {
  addMonthsToKey, daysBetween, daysInMonth, fromISODate, groupBy, isWeekend, isoWeekKey,
  mean, monthKey, round2, sum, todayISO,
} from '@/lib/utils';

export interface Bucket {
  key: string;
  label: string;
  expense: number;
  income: number;
  net: number;
  count: number;
}

export interface Slice {
  name: string;
  value: number;
  count: number;
  share: number; // % of the total
}

export interface DateRange {
  from: string;
  to: string;
}

export function inRange(t: Transaction, range?: DateRange): boolean {
  if (!range) return true;
  return t.date >= range.from && t.date <= range.to;
}

/** True for money moved between the user's own accounts rather than earned or spent. */
export function isTransfer(t: Transaction): boolean {
  return TRANSFER_CATEGORIES.includes(t.category);
}

/** Expenditure, excluding self-transfers such as a credit card bill payment. */
export function expensesOf(txns: Transaction[]): Transaction[] {
  return txns.filter((t) => t.kind === 'expense' && !isTransfer(t));
}

/** Earnings, excluding the incoming leg of a self-transfer. */
export function incomeOf(txns: Transaction[]): Transaction[] {
  return txns.filter((t) => t.kind === 'income' && !isTransfer(t));
}

export function totalOf(txns: Transaction[]): number {
  return round2(sum(txns.map((t) => t.amount)));
}

/** Money that left the wallet but was not consumed (SIPs, FDs) — savings, not spend. */
export function investedOf(txns: Transaction[]): number {
  return totalOf(expensesOf(txns).filter((t) => SAVINGS_LIKE_CATEGORIES.includes(t.category)));
}

/** Consumption spend: expenses excluding investment transfers. */
export function consumptionOf(txns: Transaction[]): number {
  return round2(totalOf(expensesOf(txns)) - investedOf(txns));
}

export function monthRange(key: string): DateRange {
  return { from: `${key}-01`, to: `${key}-${String(daysInMonth(key)).padStart(2, '0')}` };
}

export function currentMonthKey(): string {
  return monthKey(todayISO());
}

/** Rolls transactions up by month, oldest first, with empty months filled in. */
export function monthlySeries(txns: Transaction[], months?: number): Bucket[] {
  if (!txns.length) return [];
  const byMonth = groupBy(txns, (t) => monthKey(t.date));
  const keys = Object.keys(byMonth).sort();
  let cursor = keys[0];
  const last = keys[keys.length - 1];
  const out: Bucket[] = [];
  while (cursor <= last) {
    const group = byMonth[cursor] ?? [];
    out.push(bucketFor(cursor, group));
    cursor = addMonthsToKey(cursor, 1);
  }
  return months ? out.slice(-months) : out;
}

function bucketFor(key: string, group: Transaction[]): Bucket {
  const expense = totalOf(expensesOf(group));
  const income = totalOf(incomeOf(group));
  return { key, label: key, expense, income, net: round2(income - expense), count: group.length };
}

export function dailySeries(txns: Transaction[], range: DateRange): Bucket[] {
  const byDay = groupBy(txns.filter((t) => inRange(t, range)), (t) => t.date);
  const out: Bucket[] = [];
  const days = daysBetween(range.from, range.to);
  for (let i = 0; i <= days; i++) {
    const d = fromISODate(range.from);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(bucketFor(key, byDay[key] ?? []));
  }
  return out;
}

export function weeklySeries(txns: Transaction[]): Bucket[] {
  const byWeek = groupBy(txns, (t) => isoWeekKey(t.date));
  return Object.entries(byWeek)
    .map(([key, group]) => bucketFor(key, group))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function yearlySeries(txns: Transaction[]): Bucket[] {
  const byYear = groupBy(txns, (t) => t.date.slice(0, 4));
  return Object.entries(byYear)
    .map(([key, group]) => bucketFor(key, group))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Generic breakdown of expenses by any string field, sorted biggest first. */
export function breakdown(
  txns: Transaction[],
  keyFn: (t: Transaction) => string | undefined,
  fallback = 'Unspecified',
): Slice[] {
  const rows = expensesOf(txns);
  const total = totalOf(rows);
  const groups = groupBy(rows, (t) => keyFn(t) || fallback);
  return Object.entries(groups)
    .map(([name, group]) => {
      const value = totalOf(group);
      return { name, value, count: group.length, share: total > 0 ? round2((value / total) * 100) : 0 };
    })
    .sort((a, b) => b.value - a.value);
}

export const byCategory = (t: Transaction[]) => breakdown(t, (x) => x.category);
export const bySubcategory = (t: Transaction[]) => breakdown(t, (x) => x.subcategory, 'General');
export const byPaymentMode = (t: Transaction[]) => breakdown(t, (x) => x.paymentMode);
export const byMerchant = (t: Transaction[]) => breakdown(t, (x) => x.merchant, 'Unknown');
export const byTag = (txns: Transaction[]): Slice[] => {
  const rows = expensesOf(txns);
  const total = totalOf(rows);
  const acc: Record<string, { value: number; count: number }> = {};
  for (const t of rows) {
    for (const tag of t.tags) {
      acc[tag] ||= { value: 0, count: 0 };
      acc[tag].value += t.amount;
      acc[tag].count += 1;
    }
  }
  return Object.entries(acc)
    .map(([name, v]) => ({ name, value: round2(v.value), count: v.count, share: total ? round2((v.value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);
};

export function byAccount(txns: Transaction[], accounts: Account[]): Slice[] {
  const nameOf = (id?: string) => accounts.find((a) => a.id === id);
  return breakdown(txns, (t) => {
    const acc = nameOf(t.accountId);
    return acc ? `${acc.bankName} ····${acc.last4}` : undefined;
  }, 'No account linked');
}

export function byBank(txns: Transaction[], accounts: Account[]): Slice[] {
  return breakdown(txns, (t) => accounts.find((a) => a.id === t.accountId)?.bankName, 'No account linked');
}

export function byCard(txns: Transaction[], accounts: Account[]): Slice[] {
  const cards = accounts.filter((a) => a.accountType === 'Credit Card');
  return breakdown(
    txns.filter((t) => cards.some((c) => c.id === t.accountId)),
    (t) => {
      const c = cards.find((x) => x.id === t.accountId);
      return c ? `${c.cardName || c.accountName} ····${c.last4}` : undefined;
    },
    'Other card',
  );
}

export interface WeekdaySplit {
  weekdayTotal: number;
  weekendTotal: number;
  weekdayAvg: number;
  weekendAvg: number;
  /** Positive means the weekend day costs more than the weekday. */
  liftPercent: number;
}

export function weekdayVsWeekend(txns: Transaction[]): WeekdaySplit {
  const rows = expensesOf(txns);
  const weekend = rows.filter((t) => isWeekend(t.date));
  const weekday = rows.filter((t) => !isWeekend(t.date));
  const weekdayDays = new Set(weekday.map((t) => t.date)).size || 1;
  const weekendDays = new Set(weekend.map((t) => t.date)).size || 1;
  const weekdayAvg = round2(totalOf(weekday) / weekdayDays);
  const weekendAvg = round2(totalOf(weekend) / weekendDays);
  return {
    weekdayTotal: totalOf(weekday),
    weekendTotal: totalOf(weekend),
    weekdayAvg,
    weekendAvg,
    liftPercent: weekdayAvg > 0 ? round2(((weekendAvg - weekdayAvg) / weekdayAvg) * 100) : 0,
  };
}

/** Average spend per calendar day across the range that actually has data. */
export function averageDailySpend(txns: Transaction[], range?: DateRange): number {
  const rows = expensesOf(range ? txns.filter((t) => inRange(t, range)) : txns);
  if (!rows.length) return 0;
  const dates = rows.map((t) => t.date).sort();
  const span = range
    ? daysBetween(range.from, range.to) + 1
    : Math.max(1, daysBetween(dates[0], dates[dates.length - 1]) + 1);
  return round2(totalOf(rows) / span);
}

export interface AccountBalance {
  account: Account;
  /** Signed balance: positive = money available, for a card = amount outstanding. */
  balance: number;
  spend: number;
  credits: number;
  outstanding: number;
  utilisation: number | null;
}

/**
 * Running balance per account from its opening balance plus every posted movement.
 * Credit cards report an outstanding figure instead of a cash balance.
 */
export function accountBalances(accounts: Account[], txns: Transaction[]): AccountBalance[] {
  return accounts.map((account) => {
    const rows = txns.filter((t) => t.accountId === account.id);
    // Balances count every movement, transfers included — that is the whole
    // point of a transfer, even though it is neither income nor spending.
    const spend = totalOf(rows.filter((t) => t.kind === 'expense'));
    const credits = totalOf(rows.filter((t) => t.kind === 'income'));
    const isCard = account.accountType === 'Credit Card';
    const outstanding = isCard ? round2(Math.max(0, spend - credits)) : 0;
    const balance = isCard ? outstanding : round2(account.openingBalance + credits - spend);
    const utilisation =
      isCard && account.creditLimit ? round2((outstanding / account.creditLimit) * 100) : null;
    return { account, balance, spend, credits, outstanding, utilisation };
  });
}

/** Cash across every non-credit account. */
export function cashBalance(accounts: Account[], txns: Transaction[]): number {
  return round2(
    sum(
      accountBalances(accounts, txns)
        .filter((b) => b.account.accountType !== 'Credit Card' && !b.account.archived)
        .map((b) => b.balance),
    ),
  );
}

export function creditOutstanding(accounts: Account[], txns: Transaction[]): number {
  return round2(sum(accountBalances(accounts, txns).map((b) => b.outstanding)));
}

export interface PeriodSummary {
  income: number;
  expense: number;
  invested: number;
  consumption: number;
  net: number;
  savingsRate: number;
  txnCount: number;
  avgDaily: number;
  topCategory: Slice | null;
}

export function summarise(txns: Transaction[], range?: DateRange): PeriodSummary {
  const rows = range ? txns.filter((t) => inRange(t, range)) : txns;
  const income = totalOf(incomeOf(rows));
  const expense = totalOf(expensesOf(rows));
  const invested = investedOf(rows);
  const net = round2(income - expense);
  const cats = byCategory(rows);
  return {
    income,
    expense,
    invested,
    consumption: round2(expense - invested),
    net,
    // Investments are savings that happen to leave the account, so they count
    // towards the savings rate rather than against it.
    savingsRate: income > 0 ? round2(((income - expense + invested) / income) * 100) : 0,
    txnCount: rows.length,
    avgDaily: averageDailySpend(rows, range),
    topCategory: cats[0] ?? null,
  };
}

/** Percentage change from a to b, guarding against a zero base. */
export function deltaPercent(previous: number, current: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

/** Simple moving average, used to smooth the trend lines. */
export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => round2(mean(values.slice(Math.max(0, i - window + 1), i + 1))));
}
