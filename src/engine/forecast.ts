import type { Account, Goal, Transaction } from '@/types';
import {
  addMonthsToKey, daysInMonth, linearRegression, mean, median, monthKey, round2, todayISO,
} from '@/lib/utils';
import { cashBalance, expensesOf, incomeOf, monthlySeries, totalOf } from './analytics';

export interface MonthEndForecast {
  month: string;
  actualToDate: number;
  /** Projection for the remaining days of the month. */
  projectedRemaining: number;
  projectedTotal: number;
  /** Confidence 0..1, driven by how much history and how stable it is. */
  confidence: number;
  method: string;
  daysElapsed: number;
  daysTotal: number;
  /** Same-month total a year ago, when available. */
  comparableLastYear: number | null;
}

/**
 * Projects this month's total spend.
 *
 * Blends the run-rate so far with the typical shape of previous months, so a
 * quiet first week does not under-predict a month that always ends heavy.
 */
export function forecastMonthEnd(txns: Transaction[], today = todayISO()): MonthEndForecast {
  const month = monthKey(today);
  const daysTotal = daysInMonth(month);
  const daysElapsed = Math.max(1, Number(today.slice(8, 10)));
  const rows = expensesOf(txns);
  const thisMonth = rows.filter((t) => monthKey(t.date) === month);
  const actualToDate = totalOf(thisMonth);

  const history = monthlySeries(rows)
    .filter((b) => b.key < month)
    .slice(-12);
  const historicTotals = history.map((b) => b.expense).filter((n) => n > 0);

  const runRate = (actualToDate / daysElapsed) * daysTotal;

  let projectedTotal = runRate;
  let method = 'Run-rate from this month so far';
  let confidence = 0.4;

  if (historicTotals.length >= 3) {
    const typical = median(historicTotals);
    const { slope, intercept } = linearRegression(historicTotals);
    const trended = Math.max(0, intercept + slope * historicTotals.length);
    // Weight the run-rate more heavily as the month progresses.
    const w = Math.min(0.85, daysElapsed / daysTotal);
    const historic = trended * 0.6 + typical * 0.4;
    projectedTotal = runRate * w + historic * (1 - w);
    method = 'Run-rate blended with a 12-month trend';
    const spread = historicTotals.length > 1 ? stability(historicTotals) : 0.5;
    confidence = round2(Math.min(0.92, 0.45 + w * 0.25 + spread * 0.25));
  } else if (historicTotals.length > 0) {
    projectedTotal = runRate * 0.7 + mean(historicTotals) * 0.3;
    method = 'Run-rate blended with limited history';
    confidence = 0.5;
  }

  projectedTotal = round2(Math.max(projectedTotal, actualToDate));
  const lastYearKey = addMonthsToKey(month, -12);
  const lastYear = rows.filter((t) => monthKey(t.date) === lastYearKey);

  return {
    month,
    actualToDate,
    projectedRemaining: round2(Math.max(0, projectedTotal - actualToDate)),
    projectedTotal,
    confidence,
    method,
    daysElapsed,
    daysTotal,
    comparableLastYear: lastYear.length ? totalOf(lastYear) : null,
  };
}

/** 0..1 — how consistent the monthly totals are (1 = very stable). */
function stability(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
  return Math.max(0, 1 - sd / m);
}

export interface YearEndForecast {
  year: string;
  expenseToDate: number;
  incomeToDate: number;
  projectedExpense: number;
  projectedIncome: number;
  projectedSavings: number;
  monthsRemaining: number;
}

export function forecastYearEnd(txns: Transaction[], today = todayISO()): YearEndForecast {
  const year = today.slice(0, 4);
  const rows = txns.filter((t) => t.date.slice(0, 4) === year);
  const expenseToDate = totalOf(expensesOf(rows));
  const incomeToDate = totalOf(incomeOf(rows));
  const monthNow = Number(today.slice(5, 7));
  const monthsRemaining = 12 - monthNow;

  const monthEnd = forecastMonthEnd(txns, today);
  const history = monthlySeries(expensesOf(txns)).filter((b) => b.key < monthKey(today)).slice(-6);
  const typicalExpense = history.length ? median(history.map((b) => b.expense)) : monthEnd.projectedTotal;

  const incomeHistory = monthlySeries(incomeOf(txns)).filter((b) => b.key < monthKey(today)).slice(-6);
  const typicalIncome = incomeHistory.length ? median(incomeHistory.map((b) => b.income)) : 0;
  const currentMonthIncome = totalOf(incomeOf(txns).filter((t) => monthKey(t.date) === monthKey(today)));

  const projectedExpense = round2(
    expenseToDate - totalOf(expensesOf(txns).filter((t) => monthKey(t.date) === monthKey(today))) +
      monthEnd.projectedTotal +
      typicalExpense * monthsRemaining,
  );
  const projectedIncome = round2(
    incomeToDate + Math.max(0, typicalIncome - currentMonthIncome) + typicalIncome * monthsRemaining,
  );

  return {
    year,
    expenseToDate,
    incomeToDate,
    projectedExpense,
    projectedIncome,
    projectedSavings: round2(projectedIncome - projectedExpense),
    monthsRemaining,
  };
}

export interface CashProjectionPoint {
  month: string;
  openingBalance: number;
  income: number;
  expense: number;
  closingBalance: number;
  projected: boolean;
}

/** Rolls the current cash balance forward using typical monthly income and spend. */
export function projectCashBalance(
  accounts: Account[],
  txns: Transaction[],
  monthsAhead = 6,
  today = todayISO(),
): CashProjectionPoint[] {
  const start = cashBalance(accounts, txns);
  const history = monthlySeries(txns).filter((b) => b.key < monthKey(today)).slice(-6);
  const typicalIncome = history.length ? median(history.map((b) => b.income)) : 0;
  const typicalExpense = history.length ? median(history.map((b) => b.expense)) : 0;

  const points: CashProjectionPoint[] = [];
  let balance = start;
  for (let i = 1; i <= monthsAhead; i++) {
    const month = addMonthsToKey(monthKey(today), i);
    const opening = balance;
    balance = round2(opening + typicalIncome - typicalExpense);
    points.push({
      month,
      openingBalance: opening,
      income: round2(typicalIncome),
      expense: round2(typicalExpense),
      closingBalance: balance,
      projected: true,
    });
  }
  return points;
}

export interface SavingsPotential {
  currentMonthlySavings: number;
  potentialMonthlySavings: number;
  /** Categories where trimming to the historical median frees up money. */
  opportunities: Array<{ category: string; current: number; typical: number; saving: number }>;
}

/**
 * Compares this month's category spend against its own historical median.
 * Anything meaningfully above trend is a candidate saving, not a judgement.
 */
export function savingsPotential(txns: Transaction[], today = todayISO()): SavingsPotential {
  const month = monthKey(today);
  const current = expensesOf(txns).filter((t) => monthKey(t.date) === month);
  const past = expensesOf(txns).filter((t) => monthKey(t.date) < month);

  const categories = [...new Set(current.map((t) => t.category))];
  const opportunities: SavingsPotential['opportunities'] = [];

  for (const category of categories) {
    const currentTotal = totalOf(current.filter((t) => t.category === category));
    const monthlyTotals = Object.values(
      past
        .filter((t) => t.category === category)
        .reduce<Record<string, number>>((acc, t) => {
          acc[monthKey(t.date)] = (acc[monthKey(t.date)] ?? 0) + t.amount;
          return acc;
        }, {}),
    );
    if (monthlyTotals.length < 2) continue;
    const typical = round2(median(monthlyTotals));
    const saving = round2(currentTotal - typical);
    if (saving > 0 && saving / Math.max(typical, 1) > 0.15) {
      opportunities.push({ category, current: currentTotal, typical, saving });
    }
  }
  opportunities.sort((a, b) => b.saving - a.saving);

  const incomeThisMonth = totalOf(incomeOf(txns).filter((t) => monthKey(t.date) === month));
  const spendThisMonth = totalOf(current);
  const currentMonthlySavings = round2(incomeThisMonth - spendThisMonth);

  return {
    currentMonthlySavings,
    potentialMonthlySavings: round2(currentMonthlySavings + opportunities.reduce((a, o) => a + o.saving, 0)),
    opportunities,
  };
}

export interface GoalProjection {
  goal: Goal;
  progress: number;
  remaining: number;
  /** Monthly contribution implied by the history, or the planned figure. */
  monthlyRate: number;
  expectedCompletion: string | null;
  monthsToGo: number | null;
  onTrack: boolean | null;
}

export function projectGoal(goal: Goal, fallbackMonthlySavings: number, today = todayISO()): GoalProjection {
  const remaining = round2(Math.max(0, goal.targetAmount - goal.currentAmount));
  const progress = goal.targetAmount > 0 ? round2((goal.currentAmount / goal.targetAmount) * 100) : 0;

  const contributionMonths = new Set(goal.contributions.map((c) => monthKey(c.date)));
  const observedRate = contributionMonths.size
    ? round2(goal.contributions.reduce((a, c) => a + c.amount, 0) / contributionMonths.size)
    : 0;
  const monthlyRate = goal.monthlyContribution || observedRate || Math.max(0, fallbackMonthlySavings);

  let expectedCompletion: string | null = null;
  let monthsToGo: number | null = null;
  if (remaining === 0) {
    expectedCompletion = today;
    monthsToGo = 0;
  } else if (monthlyRate > 0) {
    monthsToGo = Math.ceil(remaining / monthlyRate);
    expectedCompletion = `${addMonthsToKey(monthKey(today), monthsToGo)}-01`;
  }

  const onTrack =
    goal.targetDate && expectedCompletion ? expectedCompletion <= goal.targetDate : null;

  return { goal, progress, remaining, monthlyRate, expectedCompletion, monthsToGo, onTrack };
}
