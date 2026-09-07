import type { Account, Budget, Goal, Transaction } from '@/types';
import { addMonthsToKey, clamp, mean, monthKey, round2, todayISO } from '@/lib/utils';
import { cashBalance, creditOutstanding, expensesOf, incomeOf, monthlySeries, totalOf } from './analytics';
import { evaluateAll } from './budget';

export interface HealthComponent {
  key: string;
  label: string;
  score: number; // 0..100
  weight: number;
  detail: string;
}

export interface HealthScore {
  score: number; // 0..100
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs work' | 'At risk';
  components: HealthComponent[];
  summary: string;
}

/**
 * A single 0-100 read on financial health, built from six weighted components.
 * Components with no data score a neutral 50 rather than zero, so an empty
 * ledger reads as "unknown", not "failing".
 */
export function financialHealth(
  txns: Transaction[],
  accounts: Account[],
  budgets: Budget[],
  goals: Goal[],
  today = todayISO(),
): HealthScore {
  const month = monthKey(today);
  const recentMonths = [0, 1, 2].map((i) => addMonthsToKey(month, -i));
  const recent = txns.filter((t) => recentMonths.includes(monthKey(t.date)));

  const income = totalOf(incomeOf(recent));
  const expense = totalOf(expensesOf(recent));
  const monthlyExpense = expense / recentMonths.length;

  const components: HealthComponent[] = [
    savingsComponent(income, expense),
    runwayComponent(accounts, txns, monthlyExpense),
    creditComponent(accounts, txns),
    budgetComponent(budgets, txns, today),
    consistencyComponent(txns, month),
    goalComponent(goals),
  ];

  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  const score = Math.round(components.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight);

  return { score, grade: gradeFor(score), components, summary: summaryFor(score, components) };
}

function gradeFor(score: number): HealthScore['grade'] {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  if (score >= 40) return 'Needs work';
  return 'At risk';
}

function summaryFor(score: number, components: HealthComponent[]): string {
  const weakest = [...components].sort((a, b) => a.score - b.score)[0];
  const strongest = [...components].sort((a, b) => b.score - a.score)[0];
  if (score >= 70) return `Solid overall. ${strongest.label} is your strongest area; ${weakest.label.toLowerCase()} has the most room left.`;
  if (score >= 55) return `Broadly stable, but ${weakest.label.toLowerCase()} is holding the score down.`;
  return `${weakest.label} needs attention first — it is the biggest drag on your score right now.`;
}

function savingsComponent(income: number, expense: number): HealthComponent {
  if (income <= 0) {
    return { key: 'savings', label: 'Savings rate', score: 50, weight: 30, detail: 'No income recorded in the last three months.' };
  }
  const rate = ((income - expense) / income) * 100;
  // 0% saved scores 20, 30% saved scores 100, overspending falls below 20.
  const score = clamp(20 + (rate / 30) * 80, 0, 100);
  return {
    key: 'savings',
    label: 'Savings rate',
    score: Math.round(score),
    weight: 30,
    detail: `Saving ${round2(rate)}% of income over the last three months.`,
  };
}

function runwayComponent(accounts: Account[], txns: Transaction[], monthlyExpense: number): HealthComponent {
  const cash = cashBalance(accounts, txns);
  if (monthlyExpense <= 0) {
    return { key: 'runway', label: 'Emergency runway', score: 50, weight: 25, detail: 'Not enough spending history to measure runway.' };
  }
  const months = cash / monthlyExpense;
  // Six months of expenses is the classic target and scores full marks.
  const score = clamp((months / 6) * 100, 0, 100);
  return {
    key: 'runway',
    label: 'Emergency runway',
    score: Math.round(score),
    weight: 25,
    detail: `${round2(Math.max(0, months))} months of expenses covered by available cash.`,
  };
}

function creditComponent(accounts: Account[], txns: Transaction[]): HealthComponent {
  const cards = accounts.filter((a) => a.accountType === 'Credit Card' && a.creditLimit);
  const limit = cards.reduce((a, c) => a + (c.creditLimit ?? 0), 0);
  if (!cards.length || limit <= 0) {
    return { key: 'credit', label: 'Credit usage', score: 75, weight: 15, detail: 'No credit card limits on record.' };
  }
  const outstanding = creditOutstanding(accounts, txns);
  const util = (outstanding / limit) * 100;
  // Under 30% is healthy; 100% used scores zero.
  const score = util <= 30 ? 100 : clamp(100 - ((util - 30) / 70) * 100, 0, 100);
  return {
    key: 'credit',
    label: 'Credit usage',
    score: Math.round(score),
    weight: 15,
    detail: `${round2(util)}% of your ₹${Math.round(limit).toLocaleString('en-IN')} limit in use.`,
  };
}

function budgetComponent(budgets: Budget[], txns: Transaction[], today: string): HealthComponent {
  const statuses = evaluateAll(budgets, txns, today);
  if (!statuses.length) {
    return { key: 'budget', label: 'Budget discipline', score: 50, weight: 15, detail: 'No budgets set yet.' };
  }
  const scores = statuses.map((s) => (s.utilisation <= 100 ? 100 - s.utilisation * 0.2 : clamp(80 - (s.utilisation - 100), 0, 80)));
  const avg = mean(scores);
  const breached = statuses.filter((s) => s.utilisation >= 100).length;
  return {
    key: 'budget',
    label: 'Budget discipline',
    score: Math.round(clamp(avg, 0, 100)),
    weight: 15,
    detail: breached ? `${breached} of ${statuses.length} budgets exceeded.` : `All ${statuses.length} budgets still within limit.`,
  };
}

function consistencyComponent(txns: Transaction[], month: string): HealthComponent {
  const series = monthlySeries(expensesOf(txns)).filter((b) => b.key <= month && b.expense > 0).slice(-6);
  if (series.length < 3) {
    return { key: 'consistency', label: 'Spending stability', score: 50, weight: 10, detail: 'Needs a few more months of history.' };
  }
  const values = series.map((b) => b.expense);
  const avg = mean(values);
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - avg) ** 2, 0) / values.length);
  const cv = avg > 0 ? sd / avg : 1;
  // A coefficient of variation of 0.4 or worse means very erratic months.
  const score = clamp(100 - (cv / 0.4) * 100, 0, 100);
  return {
    key: 'consistency',
    label: 'Spending stability',
    score: Math.round(score),
    weight: 10,
    detail: `Monthly spend varies by about ${Math.round(cv * 100)}% around your ₹${Math.round(avg).toLocaleString('en-IN')} average.`,
  };
}

function goalComponent(goals: Goal[]): HealthComponent {
  if (!goals.length) {
    return { key: 'goals', label: 'Goal progress', score: 50, weight: 5, detail: 'No savings goals created yet.' };
  }
  const progress = goals.map((g) => (g.targetAmount > 0 ? clamp((g.currentAmount / g.targetAmount) * 100, 0, 100) : 0));
  const avg = mean(progress);
  return {
    key: 'goals',
    label: 'Goal progress',
    score: Math.round(avg),
    weight: 5,
    detail: `${goals.length} goal${goals.length === 1 ? '' : 's'} averaging ${Math.round(avg)}% funded.`,
  };
}
