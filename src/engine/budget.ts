import type { Budget, BudgetPeriod, Transaction } from '@/types';
import { addMonthsToKey, monthKey, round2 } from '@/lib/utils';
import { expensesOf, totalOf } from './analytics';

export interface BudgetStatus {
  budget: Budget;
  /** The concrete period being measured, e.g. '2026-03' or '2026-Q1'. */
  periodLabel: string;
  allocated: number;
  spent: number;
  remaining: number;
  utilisation: number;
  /** Highest threshold crossed, or null while under all of them. */
  alertLevel: number | null;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
  /** Spend expected by period end at the current daily pace. */
  projected: number;
  projectedOverrun: number;
  daysElapsed: number;
  daysTotal: number;
}

/** Months covered by a budget period containing the given month. */
export function periodMonths(period: BudgetPeriod, month: string): string[] {
  if (period === 'monthly') return [month];
  const [y, m] = month.split('-').map(Number);
  if (period === 'quarterly') {
    const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
    return [0, 1, 2].map((i) => addMonthsToKey(`${y}-${String(startMonth).padStart(2, '0')}`, i));
  }
  return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
}

export function periodLabel(period: BudgetPeriod, month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (period === 'monthly') return month;
  if (period === 'quarterly') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return String(y);
}

function daysInPeriod(months: string[]): number {
  return months.reduce((acc, key) => {
    const [y, m] = key.split('-').map(Number);
    return acc + new Date(y, m, 0).getDate();
  }, 0);
}

function daysElapsedInPeriod(months: string[], today: string): number {
  let elapsed = 0;
  for (const key of months) {
    const [y, m] = key.split('-').map(Number);
    const total = new Date(y, m, 0).getDate();
    if (key < monthKey(today)) elapsed += total;
    else if (key === monthKey(today)) elapsed += Number(today.slice(8, 10));
  }
  return Math.max(1, elapsed);
}

/**
 * Evaluates one budget against the ledger for the period containing `today`.
 * Only approved (posted) transactions are ever passed in here.
 */
export function evaluateBudget(
  budget: Budget,
  txns: Transaction[],
  today: string,
  thresholds: number[] = [80, 90, 100],
): BudgetStatus {
  const month = monthKey(today);
  const months = periodMonths(budget.period, month);
  const rows = expensesOf(txns).filter(
    (t) => months.includes(monthKey(t.date)) && (budget.category === 'ALL' || t.category === budget.category),
  );
  const spent = totalOf(rows);
  const allocated = budget.amount;
  const utilisation = allocated > 0 ? round2((spent / allocated) * 100) : 0;

  const crossed = [...thresholds].sort((a, b) => a - b).filter((t) => utilisation >= t);
  const alertLevel = crossed.length ? crossed[crossed.length - 1] : null;

  const daysTotal = daysInPeriod(months);
  const daysElapsed = Math.min(daysTotal, daysElapsedInPeriod(months, today));
  const projected = round2((spent / daysElapsed) * daysTotal);

  let status: BudgetStatus['status'] = 'ok';
  if (utilisation >= 100) status = 'exceeded';
  else if (utilisation >= 90) status = 'critical';
  else if (utilisation >= 80) status = 'warning';

  return {
    budget,
    periodLabel: periodLabel(budget.period, month),
    allocated,
    spent,
    remaining: round2(allocated - spent),
    utilisation,
    alertLevel,
    status,
    projected,
    projectedOverrun: round2(Math.max(0, projected - allocated)),
    daysElapsed,
    daysTotal,
  };
}

/** Budgets that apply to the month containing `today`, newest effective date wins. */
export function activeBudgets(budgets: Budget[], today: string): Budget[] {
  const month = monthKey(today);
  const applicable = budgets.filter((b) => b.effectiveFrom <= month);
  const byKey = new Map<string, Budget>();
  for (const b of applicable.sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom))) {
    byKey.set(`${b.category}|${b.period}`, b);
  }
  return [...byKey.values()];
}

export function evaluateAll(
  budgets: Budget[],
  txns: Transaction[],
  today: string,
  thresholds: number[] = [80, 90, 100],
): BudgetStatus[] {
  return activeBudgets(budgets, today)
    .map((b) => evaluateBudget(b, txns, today, thresholds))
    .sort((a, b) => b.utilisation - a.utilisation);
}

export interface BudgetAlert {
  id: string;
  level: number;
  severity: 'warning' | 'critical' | 'exceeded';
  category: string;
  message: string;
  utilisation: number;
}

/** Alert rows for the categories that have crossed a threshold. */
export function budgetAlerts(statuses: BudgetStatus[]): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  for (const s of statuses) {
    if (s.alertLevel === null) {
      // Not over yet, but on course to be — worth flagging early.
      if (s.projectedOverrun > 0 && s.utilisation >= 50) {
        alerts.push({
          id: `${s.budget.id}-projection`,
          level: 0,
          severity: 'warning',
          category: s.budget.category,
          utilisation: s.utilisation,
          message: `On the current pace, ${label(s)} will finish at ₹${Math.round(s.projected).toLocaleString('en-IN')} — ₹${Math.round(s.projectedOverrun).toLocaleString('en-IN')} over budget.`,
        });
      }
      continue;
    }
    const severity = s.utilisation >= 100 ? 'exceeded' : s.utilisation >= 90 ? 'critical' : 'warning';
    alerts.push({
      id: `${s.budget.id}-${s.alertLevel}`,
      level: s.alertLevel,
      severity,
      category: s.budget.category,
      utilisation: s.utilisation,
      message:
        severity === 'exceeded'
          ? `${label(s)} is over budget — ₹${Math.round(Math.abs(s.remaining)).toLocaleString('en-IN')} above the ₹${Math.round(s.allocated).toLocaleString('en-IN')} limit.`
          : `${label(s)} has used ${s.utilisation}% of its ₹${Math.round(s.allocated).toLocaleString('en-IN')} budget.`,
    });
  }
  return alerts.sort((a, b) => b.utilisation - a.utilisation);
}

function label(s: BudgetStatus): string {
  return s.budget.category === 'ALL' ? `Your ${s.budget.period} budget` : s.budget.category;
}
