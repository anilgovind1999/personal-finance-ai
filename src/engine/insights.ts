import type { Account, Transaction } from '@/types';
import { DISCRETIONARY_CATEGORIES, ESSENTIAL_CATEGORIES } from '@/data/categories';
import {
  addMonthsToKey, daysBetween, formatMoney, mean, median, monthKey, monthLabel, round2, stdev, todayISO,
} from '@/lib/utils';
import {
  averageDailySpend, byCategory, byMerchant, creditOutstanding, deltaPercent, expensesOf,
  incomeOf, monthlySeries, totalOf, weekdayVsWeekend,
} from './analytics';

export type InsightSeverity = 'positive' | 'neutral' | 'warning' | 'critical';

export interface Insight {
  id: string;
  title: string;
  detail: string;
  severity: InsightSeverity;
  category?: string;
  /** Rupee impact, used to rank insights by what they are worth. */
  impact?: number;
  tag: string;
}

interface Ctx {
  txns: Transaction[];
  accounts: Account[];
  today: string;
  month: string;
  prevMonth: string;
  thisMonth: Transaction[];
  lastMonth: Transaction[];
}

/**
 * The financial-intelligence layer: turns the ledger into plain-language
 * observations. Every generator is defensive about thin data — with two
 * transactions there is nothing honest to say, and it says nothing.
 */
export function generateInsights(
  txns: Transaction[],
  accounts: Account[],
  today = todayISO(),
): Insight[] {
  const month = monthKey(today);
  const prevMonth = addMonthsToKey(month, -1);
  const ctx: Ctx = {
    txns,
    accounts,
    today,
    month,
    prevMonth,
    thisMonth: txns.filter((t) => monthKey(t.date) === month),
    lastMonth: txns.filter((t) => monthKey(t.date) === prevMonth),
  };

  const generators = [
    topCategoryInsight,
    monthOnMonthInsight,
    avoidableSpendInsight,
    lifestyleInflationInsight,
    dailyAverageInsight,
    weekendInsight,
    seasonalityInsight,
    subscriptionWasteInsight,
    duplicateSpendInsight,
    unusualSpendInsight,
    savingsRateInsight,
    creditUtilisationInsight,
    smallLeaksInsight,
    merchantConcentrationInsight,
  ];

  const out: Insight[] = [];
  for (const gen of generators) {
    try {
      out.push(...gen(ctx));
    } catch {
      // A single generator failing must never take the whole panel down.
    }
  }
  return out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (b.impact ?? 0) - (a.impact ?? 0));
}

function severityRank(s: InsightSeverity): number {
  return { critical: 3, warning: 2, positive: 1, neutral: 0 }[s];
}

function topCategoryInsight(ctx: Ctx): Insight[] {
  const cats = byCategory(ctx.thisMonth);
  if (!cats.length) return [];
  const top = cats[0];
  if (top.value <= 0) return [];
  return [{
    id: 'top-category',
    tag: 'Where the money goes',
    title: `${top.name} is your biggest spend this month`,
    detail: `${formatMoney(top.value)} across ${top.count} transaction${top.count === 1 ? '' : 's'} — ${top.share}% of everything you spent in ${monthLabel(ctx.month)}.`,
    severity: top.share > 45 ? 'warning' : 'neutral',
    category: top.name,
    impact: top.value,
  }];
}

function monthOnMonthInsight(ctx: Ctx): Insight[] {
  const now = totalOf(expensesOf(ctx.thisMonth));
  const before = totalOf(expensesOf(ctx.lastMonth));
  if (before === 0 || now === 0) return [];
  const delta = deltaPercent(before, now);
  if (delta === null || Math.abs(delta) < 8) return [];
  const up = delta > 0;
  return [{
    id: 'mom-change',
    tag: 'Spending pattern change',
    title: up
      ? `Spending is up ${Math.round(Math.abs(delta))}% on last month`
      : `Spending is down ${Math.round(Math.abs(delta))}% on last month`,
    detail: `${formatMoney(now)} so far in ${monthLabel(ctx.month)} against ${formatMoney(before)} in ${monthLabel(ctx.prevMonth)}. ${
      up ? topMover(ctx) : 'Keep it going — the trend is in your favour.'
    }`,
    severity: up ? (delta > 30 ? 'warning' : 'neutral') : 'positive',
    impact: Math.abs(round2(now - before)),
  }];
}

function topMover(ctx: Ctx): string {
  const now = byCategory(ctx.thisMonth);
  const before = byCategory(ctx.lastMonth);
  let best: { name: string; diff: number } | null = null;
  for (const c of now) {
    const prev = before.find((b) => b.name === c.name)?.value ?? 0;
    const diff = c.value - prev;
    if (!best || diff > best.diff) best = { name: c.name, diff };
  }
  return best && best.diff > 0 ? `${best.name} accounts for ${formatMoney(round2(best.diff))} of the increase.` : '';
}

function avoidableSpendInsight(ctx: Ctx): Insight[] {
  const rows = expensesOf(ctx.thisMonth).filter((t) => DISCRETIONARY_CATEGORIES.includes(t.category));
  const total = totalOf(rows);
  const allSpend = totalOf(expensesOf(ctx.thisMonth));
  if (total <= 0 || allSpend <= 0) return [];
  const share = round2((total / allSpend) * 100);
  return [{
    id: 'avoidable',
    tag: 'Avoidable expenses',
    title: `${formatMoney(total)} went to discretionary spending`,
    detail: `That is ${share}% of this month's outgoings, across ${rows.length} transactions in categories like dining, shopping and entertainment. Trimming a quarter of it would free up ${formatMoney(round2(total * 0.25))}.`,
    severity: share > 40 ? 'warning' : 'neutral',
    impact: round2(total * 0.25),
  }];
}

function lifestyleInflationInsight(ctx: Ctx): Insight[] {
  const expenseSeries = monthlySeries(expensesOf(ctx.txns)).filter((b) => b.key <= ctx.month);
  const incomeSeries = monthlySeries(incomeOf(ctx.txns)).filter((b) => b.key <= ctx.month);
  if (expenseSeries.length < 6) return [];

  const recentExpense = mean(expenseSeries.slice(-3).map((b) => b.expense));
  const olderExpense = mean(expenseSeries.slice(-6, -3).map((b) => b.expense));
  if (olderExpense <= 0) return [];
  const expenseGrowth = round2(((recentExpense - olderExpense) / olderExpense) * 100);

  const recentIncome = mean(incomeSeries.slice(-3).map((b) => b.income));
  const olderIncome = mean(incomeSeries.slice(-6, -3).map((b) => b.income));
  const incomeGrowth = olderIncome > 0 ? round2(((recentIncome - olderIncome) / olderIncome) * 100) : 0;

  if (expenseGrowth < 8) return [];
  const outpacing = expenseGrowth - incomeGrowth;
  return [{
    id: 'lifestyle-inflation',
    tag: 'Lifestyle inflation',
    title:
      outpacing > 5
        ? `Spending is growing ${round2(outpacing)}% faster than income`
        : `Spending has risen ${expenseGrowth}% over three months`,
    detail: `Your last three months averaged ${formatMoney(round2(recentExpense))} a month against ${formatMoney(round2(olderExpense))} in the three before. Income moved ${incomeGrowth >= 0 ? 'up' : 'down'} ${Math.abs(incomeGrowth)}% over the same stretch.`,
    severity: outpacing > 10 ? 'critical' : outpacing > 0 ? 'warning' : 'neutral',
    impact: round2(recentExpense - olderExpense),
  }];
}

function dailyAverageInsight(ctx: Ctx): Insight[] {
  const avg = averageDailySpend(ctx.thisMonth);
  if (avg <= 0) return [];
  const lastAvg = averageDailySpend(ctx.lastMonth);
  const delta = lastAvg > 0 ? deltaPercent(lastAvg, avg) : null;
  return [{
    id: 'daily-average',
    tag: 'Average daily spending',
    title: `You are spending ${formatMoney(avg)} a day`,
    detail:
      delta === null
        ? `Based on ${monthLabel(ctx.month)} so far.`
        : `Against ${formatMoney(lastAvg)} a day last month — ${delta >= 0 ? 'up' : 'down'} ${Math.round(Math.abs(delta))}%.`,
    severity: delta !== null && delta > 25 ? 'warning' : 'neutral',
    impact: avg,
  }];
}

function weekendInsight(ctx: Ctx): Insight[] {
  const recent = ctx.txns.filter((t) => t.date >= addMonthsToKey(ctx.month, -3) + '-01');
  const split = weekdayVsWeekend(recent);
  if (split.weekendTotal <= 0 || split.weekdayTotal <= 0 || Math.abs(split.liftPercent) < 15) return [];
  return [{
    id: 'weekend-lift',
    tag: 'Weekend vs weekday',
    title:
      split.liftPercent > 0
        ? `Weekends cost ${Math.round(split.liftPercent)}% more per day`
        : `Weekdays cost ${Math.round(Math.abs(split.liftPercent))}% more per day`,
    detail: `Over the last three months you averaged ${formatMoney(split.weekendAvg)} on a weekend day and ${formatMoney(split.weekdayAvg)} on a weekday.`,
    severity: split.liftPercent > 60 ? 'warning' : 'neutral',
    impact: round2(Math.abs(split.weekendAvg - split.weekdayAvg) * 8),
  }];
}

function seasonalityInsight(ctx: Ctx): Insight[] {
  const series = monthlySeries(expensesOf(ctx.txns)).filter((b) => b.expense > 0);
  if (series.length < 12) return [];
  const byCalendarMonth: Record<string, number[]> = {};
  for (const b of series) {
    const m = b.key.slice(5, 7);
    (byCalendarMonth[m] ||= []).push(b.expense);
  }
  const overall = mean(series.map((b) => b.expense));
  if (overall <= 0) return [];
  const ranked = Object.entries(byCalendarMonth)
    .map(([m, values]) => ({ m, avg: mean(values), lift: round2(((mean(values) - overall) / overall) * 100) }))
    .sort((a, b) => b.lift - a.lift);
  const peak = ranked[0];
  if (!peak || peak.lift < 20) return [];
  const name = new Date(2000, Number(peak.m) - 1, 1).toLocaleDateString('en-IN', { month: 'long' });
  return [{
    id: 'seasonality',
    tag: 'Expense seasonality',
    title: `${name} is consistently your heaviest month`,
    detail: `${name} runs ${peak.lift}% above your ${formatMoney(round2(overall))} monthly average. Setting aside a little each month ahead of it takes the sting out.`,
    severity: 'neutral',
    impact: round2(peak.avg - overall),
  }];
}

function subscriptionWasteInsight(ctx: Ctx): Insight[] {
  const subs = expensesOf(ctx.txns).filter(
    (t) => t.category === 'Subscriptions' || /subscription|renewal|membership/i.test(t.remarks ?? ''),
  );
  if (subs.length < 2) return [];

  const byName: Record<string, Transaction[]> = {};
  for (const t of subs) (byName[t.merchant || 'Unknown'] ||= []).push(t);

  const stale: string[] = [];
  const monthlyTotal: number[] = [];
  for (const [name, rows] of Object.entries(byName)) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    monthlyTotal.push(median(rows.map((r) => r.amount)));
    // Charged at least three times but nothing in 75 days — likely forgotten.
    if (rows.length >= 3 && daysBetween(last.date, ctx.today) > 75) stale.push(name);
  }

  const recurring = Object.entries(byName).filter(([, rows]) => rows.length >= 2);
  if (!recurring.length) return [];
  const monthlyOutlay = round2(
    recurring.reduce((acc, [, rows]) => acc + median(rows.map((r) => r.amount)), 0),
  );

  const insights: Insight[] = [{
    id: 'subscription-load',
    tag: 'Subscription waste',
    title: `${recurring.length} recurring subscriptions cost about ${formatMoney(monthlyOutlay)} a month`,
    detail: `That is ${formatMoney(round2(monthlyOutlay * 12))} a year on ${recurring.map(([n]) => n).slice(0, 5).join(', ')}${recurring.length > 5 ? ' and others' : ''}. Cancelling the ones you no longer open is the easiest saving you have.`,
    severity: monthlyOutlay > 2000 ? 'warning' : 'neutral',
    impact: round2(monthlyOutlay * 12),
  }];

  if (stale.length) {
    insights.push({
      id: 'subscription-stale',
      tag: 'Subscription waste',
      title: `${stale.length} subscription${stale.length === 1 ? '' : 's'} may have lapsed or been forgotten`,
      detail: `No charge in over 75 days from ${stale.slice(0, 4).join(', ')}. Worth checking whether the service is still active on your card.`,
      severity: 'neutral',
      impact: 0,
    });
  }
  return insights;
}

function duplicateSpendInsight(ctx: Ctx): Insight[] {
  const rows = expensesOf(ctx.txns).filter((t) => t.date >= addMonthsToKey(ctx.month, -1) + '-01');
  const seen = new Map<string, Transaction[]>();
  for (const t of rows) {
    const key = `${t.date}|${t.amount.toFixed(2)}|${t.merchant.toLowerCase()}`;
    const list = seen.get(key) ?? [];
    list.push(t);
    seen.set(key, list);
  }
  const dupes = [...seen.values()].filter((list) => list.length > 1);
  if (!dupes.length) return [];
  const wasted = round2(dupes.reduce((acc, list) => acc + list[0].amount * (list.length - 1), 0));
  const example = dupes[0][0];
  return [{
    id: 'duplicates',
    tag: 'Duplicate spending',
    title: `${dupes.length} possible duplicate charge${dupes.length === 1 ? '' : 's'} found`,
    detail: `For example ${formatMoney(example.amount)} at ${example.merchant} appears ${dupes[0].length} times on ${example.date}. If these were double charges, ${formatMoney(wasted)} is worth reclaiming.`,
    severity: 'warning',
    impact: wasted,
  }];
}

function unusualSpendInsight(ctx: Ctx): Insight[] {
  const rows = expensesOf(ctx.txns);
  if (rows.length < 12) return [];
  const amounts = rows.map((t) => t.amount);
  const m = mean(amounts);
  const sd = stdev(amounts);
  if (sd <= 0) return [];
  const recent = expensesOf(ctx.thisMonth);
  // Three sigma above the mean is genuinely out of character, not just a big week.
  const outliers = recent.filter((t) => t.amount > m + 3 * sd).sort((a, b) => b.amount - a.amount);
  if (!outliers.length) return [];
  const top = outliers[0];
  return [{
    id: 'unusual-spend',
    tag: 'Unusual spending alert',
    title: `${formatMoney(top.amount)} at ${top.merchant} is well outside your usual range`,
    detail: `Your typical transaction is ${formatMoney(round2(m))}. ${outliers.length > 1 ? `${outliers.length} transactions this month stand out; the largest is shown.` : 'Worth confirming it is expected.'}`,
    severity: 'warning',
    category: top.category,
    impact: top.amount,
  }];
}

function savingsRateInsight(ctx: Ctx): Insight[] {
  const income = totalOf(incomeOf(ctx.thisMonth));
  const expense = totalOf(expensesOf(ctx.thisMonth));
  if (income <= 0) return [];
  const rate = round2(((income - expense) / income) * 100);
  const severity: InsightSeverity = rate >= 30 ? 'positive' : rate >= 15 ? 'neutral' : rate >= 0 ? 'warning' : 'critical';
  return [{
    id: 'savings-rate',
    tag: 'Savings',
    title:
      rate < 0
        ? `You have spent ${formatMoney(round2(expense - income))} more than you earned this month`
        : `You are saving ${rate}% of your income this month`,
    detail:
      rate < 0
        ? 'Drawing down savings for a month is survivable, but two in a row is a pattern worth breaking.'
        : `${formatMoney(round2(income - expense))} of ${formatMoney(income)} kept back. A 20-30% rate is a healthy long-term target.`,
    severity,
    impact: round2(income - expense),
  }];
}

function creditUtilisationInsight(ctx: Ctx): Insight[] {
  const cards = ctx.accounts.filter((a) => a.accountType === 'Credit Card' && a.creditLimit);
  if (!cards.length) return [];
  const outstanding = creditOutstanding(ctx.accounts, ctx.txns);
  const limit = cards.reduce((a, c) => a + (c.creditLimit ?? 0), 0);
  if (limit <= 0 || outstanding <= 0) return [];
  const util = round2((outstanding / limit) * 100);
  if (util < 30) return [];
  return [{
    id: 'credit-utilisation',
    tag: 'Credit health',
    title: `Card utilisation is at ${util}%`,
    detail: `${formatMoney(outstanding)} outstanding against a ${formatMoney(limit)} limit. Staying under 30% protects your credit score.`,
    severity: util > 70 ? 'critical' : 'warning',
    impact: outstanding,
  }];
}

function smallLeaksInsight(ctx: Ctx): Insight[] {
  const small = expensesOf(ctx.thisMonth).filter((t) => t.amount <= 200);
  if (small.length < 10) return [];
  const total = totalOf(small);
  return [{
    id: 'small-leaks',
    tag: 'Possible savings',
    title: `${small.length} small payments added up to ${formatMoney(total)}`,
    detail: `Every one was under ₹200 — teas, rides, snacks. Individually invisible, together ${formatMoney(round2(total * 12))} a year at this pace.`,
    severity: 'neutral',
    impact: total,
  }];
}

function merchantConcentrationInsight(ctx: Ctx): Insight[] {
  const merchants = byMerchant(ctx.thisMonth);
  if (merchants.length < 3) return [];
  const top = merchants[0];
  if (top.share < 25 || top.count < 3) return [];
  return [{
    id: 'merchant-concentration',
    tag: 'Where the money goes',
    title: `${top.name} alone took ${top.share}% of your spending`,
    detail: `${formatMoney(top.value)} across ${top.count} visits this month. Worth a look if that is higher than you expected.`,
    severity: top.share > 40 ? 'warning' : 'neutral',
    category: top.name,
    impact: top.value,
  }];
}

/** Fixed vs variable split, shown on the analytics screen. */
export function fixedVsVariable(txns: Transaction[]): { fixed: number; variable: number; fixedShare: number } {
  const rows = expensesOf(txns);
  const fixed = totalOf(rows.filter((t) => ESSENTIAL_CATEGORIES.includes(t.category)));
  const total = totalOf(rows);
  const variable = round2(total - fixed);
  return { fixed, variable, fixedShare: total > 0 ? round2((fixed / total) * 100) : 0 };
}
