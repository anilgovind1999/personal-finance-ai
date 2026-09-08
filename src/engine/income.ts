import type { Transaction } from '@/types';
import { RECURRING_INCOME_CATEGORIES } from '@/data/categories';
import { addMonthsToKey, mean, monthKey, round2, stdev, todayISO } from '@/lib/utils';
import { incomeOf, monthlySeries, totalOf } from './analytics';

/**
 * Income analysis: the monthly and annual totals, and the split between money
 * you can count on and money you cannot.
 *
 * "Recurring" is decided from observed behaviour rather than the category label
 * alone — a salary that started two months ago is recurring, and a category
 * named "Salary" with one payment in it is not yet.
 */

export interface IncomeSource {
  /** Payer and category together identify a stream. */
  name: string;
  category: string;
  total: number;
  /** Distinct months this source paid in. */
  months: number;
  /** Typical amount per paying month. */
  average: number;
  recurring: boolean;
  /** Why it was classified that way, for the UI to show. */
  reason: string;
  lastReceived: string;
}

export interface IncomeSummary {
  /** Income received in the current calendar month. */
  thisMonth: number;
  /** Income received so far in the current calendar year. */
  thisYear: number;
  /** Average across the months that have any income, over the window. */
  monthlyAverage: number;
  /** Annualised from the monthly average — what a full year looks like at this rate. */
  annualisedRunRate: number;
  recurringMonthly: number;
  variableMonthly: number;
  /** Recurring as a percentage of average monthly income. */
  stabilityPercent: number;
  sources: IncomeSource[];
  /** Month-by-month totals, oldest first. */
  series: Array<{ month: string; total: number; recurring: number; variable: number }>;
}

const MIN_MONTHS_FOR_RECURRING = 3;

/** Groups income into streams and decides which of them are dependable. */
export function classifyIncomeSources(txns: Transaction[], today = todayISO()): IncomeSource[] {
  const rows = incomeOf(txns);
  const groups = new Map<string, Transaction[]>();
  for (const t of rows) {
    const key = `${t.merchant.toLowerCase()}|${t.category}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const recentWindow = new Set(
    Array.from({ length: 6 }, (_, i) => addMonthsToKey(monthKey(today), -i)),
  );

  return [...groups.values()]
    .map((list) => {
      const months = new Set(list.map((t) => monthKey(t.date)));
      const recentMonths = [...months].filter((m) => recentWindow.has(m)).length;
      const total = totalOf(list);
      const average = round2(total / months.size);
      const category = list[0].category;
      const labelledRecurring = RECURRING_INCOME_CATEGORIES.includes(category);

      let recurring = false;
      let reason: string;
      if (recentMonths >= MIN_MONTHS_FOR_RECURRING) {
        recurring = true;
        reason = `Received in ${recentMonths} of the last 6 months`;
      } else if (labelledRecurring && months.size >= 2) {
        // A newly started salary is dependable before it has three months behind it.
        recurring = true;
        reason = `${category} received in ${months.size} months`;
      } else if (labelledRecurring) {
        reason = `${category}, but only one payment so far`;
      } else {
        reason = months.size > 1 ? `Irregular — ${months.size} months` : 'One-off so far';
      }

      return {
        name: list[0].merchant,
        category,
        total,
        months: months.size,
        average,
        recurring,
        reason,
        lastReceived: list.map((t) => t.date).sort().at(-1) ?? '',
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function summariseIncome(txns: Transaction[], today = todayISO()): IncomeSummary {
  const rows = incomeOf(txns);
  const month = monthKey(today);
  const year = today.slice(0, 4);

  const sources = classifyIncomeSources(txns, today);
  const recurringKeys = new Set(
    sources.filter((s) => s.recurring).map((s) => `${s.name.toLowerCase()}|${s.category}`),
  );
  const isRecurring = (t: Transaction) => recurringKeys.has(`${t.merchant.toLowerCase()}|${t.category}`);

  const series = monthlySeries(rows).map((b) => {
    const inMonth = rows.filter((t) => monthKey(t.date) === b.key);
    const recurring = totalOf(inMonth.filter(isRecurring));
    return {
      month: b.key,
      total: b.income,
      recurring,
      variable: round2(b.income - recurring),
    };
  });

  // Average over months that actually had income, so a gap month does not
  // silently halve the figure.
  const earning = series.filter((s) => s.total > 0);
  const monthlyAverage = round2(mean(earning.map((s) => s.total)));
  const recurringMonthly = round2(mean(earning.map((s) => s.recurring)));

  return {
    thisMonth: totalOf(rows.filter((t) => monthKey(t.date) === month)),
    thisYear: totalOf(rows.filter((t) => t.date.slice(0, 4) === year)),
    monthlyAverage,
    annualisedRunRate: round2(monthlyAverage * 12),
    recurringMonthly,
    variableMonthly: round2(monthlyAverage - recurringMonthly),
    stabilityPercent: monthlyAverage > 0 ? round2((recurringMonthly / monthlyAverage) * 100) : 0,
    sources,
    series,
  };
}

/** How much month-to-month income varies — high means an unpredictable income. */
export function incomeVolatility(summary: IncomeSummary): number {
  const totals = summary.series.filter((s) => s.total > 0).map((s) => s.total);
  if (totals.length < 2) return 0;
  const avg = mean(totals);
  return avg > 0 ? round2((stdev(totals) / avg) * 100) : 0;
}
