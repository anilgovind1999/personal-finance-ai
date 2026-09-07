import { describe, expect, it } from 'vitest';
import type { Account, Budget, Goal, Transaction } from '@/types';
import {
  accountBalances, averageDailySpend, byCategory, byPaymentMode, cashBalance, creditOutstanding,
  monthlySeries, summarise, weekdayVsWeekend,
} from './analytics';
import { budgetAlerts, evaluateAll, evaluateBudget, periodMonths } from './budget';
import { forecastMonthEnd, forecastYearEnd, projectCashBalance, projectGoal, savingsPotential } from './forecast';
import { generateInsights } from './insights';
import { financialHealth } from './health';
import { parsePeriod, smartSearch } from './search';

const TODAY = '2026-03-20';

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    kind: 'expense',
    date: '2026-03-05',
    amount: 500,
    merchant: 'Local Store',
    category: 'Food & Dining',
    paymentMode: 'UPI',
    tags: [],
    attachmentIds: [],
    source: 'manual',
    createdAt: '2026-03-05T10:00:00.000Z',
    updatedAt: '2026-03-05T10:00:00.000Z',
    ...over,
  };
}

const savings: Account = {
  id: 'acc1', bankName: 'HDFC Bank', accountName: 'Salary Account', accountType: 'Savings',
  last4: '4521', openingBalance: 100000, createdAt: '2025-01-01T00:00:00.000Z',
};
const card: Account = {
  id: 'acc2', bankName: 'ICICI Bank', accountName: 'Amazon Pay Card', accountType: 'Credit Card',
  last4: '7788', cardName: 'Amazon Pay ICICI', creditLimit: 200000, statementDay: 18, dueDay: 5,
  openingBalance: 0, createdAt: '2025-01-01T00:00:00.000Z',
};

describe('analytics', () => {
  const txns = [
    tx({ amount: 1000, category: 'Food & Dining', accountId: 'acc1' }),
    tx({ amount: 2000, category: 'Fuel', paymentMode: 'Credit Card', accountId: 'acc2' }),
    tx({ amount: 3000, category: 'Grocery', accountId: 'acc1' }),
    tx({ kind: 'income', amount: 90000, category: 'Salary', date: '2026-03-01', accountId: 'acc1' }),
    tx({ amount: 5000, category: 'Investments', accountId: 'acc1' }),
  ];

  it('summarises income, expense and savings rate', () => {
    const s = summarise(txns);
    expect(s.income).toBe(90000);
    expect(s.expense).toBe(11000);
    expect(s.invested).toBe(5000);
    // Investments are savings, so they do not reduce the savings rate.
    expect(s.savingsRate).toBe(93.33);
    expect(s.consumption).toBe(6000);
  });

  it('breaks spending down by category, biggest first', () => {
    const cats = byCategory(txns);
    expect(cats[0].name).toBe('Investments');
    expect(cats[0].value).toBe(5000);
    expect(cats.map((c) => c.share).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });

  it('breaks spending down by payment mode', () => {
    const modes = byPaymentMode(txns);
    expect(modes.find((m) => m.name === 'Credit Card')?.value).toBe(2000);
  });

  it('computes account balances and credit outstanding', () => {
    const balances = accountBalances([savings, card], txns);
    const sav = balances.find((b) => b.account.id === 'acc1')!;
    expect(sav.balance).toBe(100000 + 90000 - 9000);
    const cc = balances.find((b) => b.account.id === 'acc2')!;
    expect(cc.outstanding).toBe(2000);
    expect(cc.utilisation).toBe(1);
    expect(cashBalance([savings, card], txns)).toBe(181000);
    expect(creditOutstanding([savings, card], txns)).toBe(2000);
  });

  it('fills gaps when building the monthly series', () => {
    const series = monthlySeries([tx({ date: '2026-01-10' }), tx({ date: '2026-04-10' })]);
    expect(series.map((b) => b.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(series[1].expense).toBe(0);
  });

  it('separates weekend from weekday spending', () => {
    const split = weekdayVsWeekend([
      tx({ date: '2026-03-14', amount: 2000 }), // Saturday
      tx({ date: '2026-03-11', amount: 500 }), // Wednesday
    ]);
    expect(split.weekendTotal).toBe(2000);
    expect(split.weekdayTotal).toBe(500);
    expect(split.liftPercent).toBe(300);
  });

  it('excludes self-transfers from income and expenses but still moves balances', () => {
    const rows = [
      tx({ amount: 4000, category: 'Fuel', paymentMode: 'Credit Card', accountId: 'acc2' }),
      // Paying the card bill moves money; it is not a second ₹4,000 of spending.
      tx({ amount: 4000, category: 'Transfers', subcategory: 'Credit Card Bill Payment', accountId: 'acc1' }),
      tx({ kind: 'income', amount: 4000, category: 'Transfers', subcategory: 'Credit Card Bill Payment', accountId: 'acc2' }),
      tx({ kind: 'income', amount: 50000, category: 'Salary', accountId: 'acc1' }),
    ];
    const s = summarise(rows);
    expect(s.expense).toBe(4000);
    expect(s.income).toBe(50000);

    const balances = accountBalances([savings, card], rows);
    // The card is settled, and the salary account is down by both the bill and nothing else.
    expect(balances.find((b) => b.account.id === 'acc2')!.outstanding).toBe(0);
    expect(balances.find((b) => b.account.id === 'acc1')!.balance).toBe(100000 + 50000 - 4000);
    expect(byCategory(rows).some((c) => c.name === 'Transfers')).toBe(false);
  });

  it('averages daily spend over the range', () => {
    const avg = averageDailySpend([tx({ date: '2026-03-01', amount: 300 }), tx({ date: '2026-03-10', amount: 700 })]);
    expect(avg).toBe(100); // 1000 over 10 days
  });
});

describe('budgets', () => {
  const budget: Budget = {
    id: 'b1', category: 'Food & Dining', period: 'monthly', amount: 8000,
    effectiveFrom: '2026-01', createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('maps a month to its quarter and year', () => {
    expect(periodMonths('quarterly', '2026-05')).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(periodMonths('annual', '2026-05')).toHaveLength(12);
  });

  it('tracks utilisation and remaining budget', () => {
    const s = evaluateBudget(budget, [tx({ amount: 6400, date: '2026-03-10' })], TODAY);
    expect(s.spent).toBe(6400);
    expect(s.utilisation).toBe(80);
    expect(s.remaining).toBe(1600);
    expect(s.alertLevel).toBe(80);
    expect(s.status).toBe('warning');
  });

  it('raises the right alert level at each threshold', () => {
    const at90 = evaluateBudget(budget, [tx({ amount: 7300, date: '2026-03-10' })], TODAY);
    expect(at90.alertLevel).toBe(90);
    expect(at90.status).toBe('critical');
    const over = evaluateBudget(budget, [tx({ amount: 9000, date: '2026-03-10' })], TODAY);
    expect(over.alertLevel).toBe(100);
    expect(over.status).toBe('exceeded');
    expect(over.remaining).toBe(-1000);
  });

  it('projects the period-end position from the pace so far', () => {
    const s = evaluateBudget(budget, [tx({ amount: 6000, date: '2026-03-10' })], TODAY);
    // 6000 over 20 of 31 days projects to about 9300.
    expect(s.projected).toBeGreaterThan(9000);
    expect(s.projectedOverrun).toBeGreaterThan(0);
  });

  it('counts only the budgeted category', () => {
    const s = evaluateBudget(budget, [tx({ amount: 5000, category: 'Fuel', date: '2026-03-10' })], TODAY);
    expect(s.spent).toBe(0);
  });

  it('an overall budget counts every category', () => {
    const all: Budget = { ...budget, id: 'b2', category: 'ALL', amount: 50000 };
    const s = evaluateBudget(all, [tx({ amount: 5000, category: 'Fuel', date: '2026-03-10' }), tx({ amount: 3000, date: '2026-03-11' })], TODAY);
    expect(s.spent).toBe(8000);
  });

  it('produces alerts for breached and projected-to-breach budgets', () => {
    const statuses = evaluateAll([budget], [tx({ amount: 8500, date: '2026-03-10' })], TODAY);
    const alerts = budgetAlerts(statuses);
    expect(alerts[0].severity).toBe('exceeded');
    expect(alerts[0].message).toContain('over budget');
  });
});

describe('forecasting', () => {
  const history: Transaction[] = [];
  for (let m = 9; m <= 14; m++) {
    const month = m <= 12 ? `2025-${String(m).padStart(2, '0')}` : `2026-${String(m - 12).padStart(2, '0')}`;
    history.push(tx({ date: `${month}-05`, amount: 20000 }));
    history.push(tx({ date: `${month}-20`, amount: 10000 }));
    history.push(tx({ kind: 'income', category: 'Salary', date: `${month}-01`, amount: 90000 }));
  }
  history.push(tx({ date: '2026-03-05', amount: 12000 }));

  it('projects month-end above the amount already spent', () => {
    const f = forecastMonthEnd(history, TODAY);
    expect(f.actualToDate).toBe(12000);
    expect(f.projectedTotal).toBeGreaterThanOrEqual(f.actualToDate);
    expect(f.projectedRemaining).toBeGreaterThanOrEqual(0);
    expect(f.confidence).toBeGreaterThan(0.4);
    expect(f.daysTotal).toBe(31);
  });

  it('projects the year end for both sides of the ledger', () => {
    const f = forecastYearEnd(history, TODAY);
    expect(f.monthsRemaining).toBe(9);
    expect(f.projectedExpense).toBeGreaterThan(f.expenseToDate);
    expect(f.projectedIncome).toBeGreaterThan(f.incomeToDate);
  });

  it('rolls the cash balance forward month by month', () => {
    const points = projectCashBalance([savings], history, 3, TODAY);
    expect(points).toHaveLength(3);
    expect(points[0].month).toBe('2026-04');
    // Income 90k against 30k of typical spend leaves the balance climbing.
    expect(points[2].closingBalance).toBeGreaterThan(points[0].closingBalance);
  });

  it('finds categories running above their own historical median', () => {
    const rows = [
      tx({ date: '2026-01-05', amount: 3000, category: 'Shopping' }),
      tx({ date: '2026-02-05', amount: 3000, category: 'Shopping' }),
      tx({ date: '2026-03-05', amount: 9000, category: 'Shopping' }),
    ];
    const p = savingsPotential(rows, TODAY);
    expect(p.opportunities[0]).toMatchObject({ category: 'Shopping', typical: 3000, saving: 6000 });
  });

  it('projects a goal completion date from the planned contribution', () => {
    const goal: Goal = {
      id: 'g1', name: 'Emergency Fund', type: 'Emergency Fund', targetAmount: 300000,
      currentAmount: 120000, monthlyContribution: 20000, createdAt: '2026-01-01T00:00:00.000Z',
      contributions: [],
    };
    const p = projectGoal(goal, 0, TODAY);
    expect(p.progress).toBe(40);
    expect(p.remaining).toBe(180000);
    expect(p.monthsToGo).toBe(9);
    expect(p.expectedCompletion).toBe('2026-12-01');
  });
});

describe('insights', () => {
  const rows: Transaction[] = [
    tx({ date: '2026-02-05', amount: 20000, category: 'Food & Dining' }),
    tx({ date: '2026-03-05', amount: 32000, category: 'Food & Dining' }),
    tx({ kind: 'income', date: '2026-03-01', amount: 90000, category: 'Salary' }),
    tx({ date: '2026-03-06', amount: 649, merchant: 'Netflix', category: 'Subscriptions' }),
    tx({ date: '2026-02-06', amount: 649, merchant: 'Netflix', category: 'Subscriptions' }),
    tx({ date: '2026-03-07', amount: 1200, merchant: 'Zomato' }),
    tx({ date: '2026-03-07', amount: 1200, merchant: 'Zomato' }),
  ];

  const insights = generateInsights(rows, [savings, card], TODAY);

  it('names the biggest category', () => {
    expect(insights.find((i) => i.id === 'top-category')?.title).toContain('Food & Dining');
  });

  it('flags the month-on-month increase', () => {
    expect(insights.find((i) => i.id === 'mom-change')?.title).toMatch(/up \d+%/);
  });

  it('detects duplicate charges', () => {
    const dup = insights.find((i) => i.id === 'duplicates');
    expect(dup).toBeTruthy();
    expect(dup!.detail).toContain('Zomato');
  });

  it('sizes the subscription load', () => {
    expect(insights.find((i) => i.id === 'subscription-load')?.title).toContain('subscriptions');
  });

  it('reports the savings rate', () => {
    expect(insights.find((i) => i.id === 'savings-rate')).toBeTruthy();
  });

  it('says nothing at all when there is no data', () => {
    expect(generateInsights([], [], TODAY)).toEqual([]);
  });
});

describe('financial health score', () => {
  it('scores a healthy profile highly', () => {
    const rows: Transaction[] = [];
    for (const m of ['2026-01', '2026-02', '2026-03']) {
      rows.push(tx({ kind: 'income', date: `${m}-01`, amount: 150000, category: 'Salary', accountId: 'acc1' }));
      rows.push(tx({ date: `${m}-10`, amount: 40000, accountId: 'acc1' }));
    }
    const h = financialHealth(rows, [savings], [], [], TODAY);
    expect(h.score).toBeGreaterThan(70);
    expect(['Excellent', 'Good']).toContain(h.grade);
    expect(h.components).toHaveLength(6);
  });

  it('scores an overspending profile poorly', () => {
    const rows: Transaction[] = [];
    for (const m of ['2026-01', '2026-02', '2026-03']) {
      rows.push(tx({ kind: 'income', date: `${m}-01`, amount: 50000, category: 'Salary', accountId: 'acc1' }));
      rows.push(tx({ date: `${m}-10`, amount: 70000, accountId: 'acc1' }));
    }
    const h = financialHealth(rows, [{ ...savings, openingBalance: 0 }], [], [], TODAY);
    expect(h.score).toBeLessThan(55);
  });

  it('stays neutral rather than failing on an empty ledger', () => {
    const h = financialHealth([], [], [], [], TODAY);
    expect(h.score).toBeGreaterThan(35);
    expect(h.score).toBeLessThan(75);
  });
});

describe('natural language search', () => {
  const rows: Transaction[] = [
    tx({ date: '2026-02-10', amount: 4000, category: 'Food & Dining', merchant: 'Swiggy' }),
    tx({ date: '2026-02-14', amount: 1500, category: 'Food & Dining', merchant: 'Zomato' }),
    tx({ date: '2026-03-02', amount: 3000, category: 'Fuel', merchant: 'Indian Oil', paymentMode: 'Credit Card', accountId: 'acc2' }),
    tx({ date: '2025-08-11', amount: 2500, category: 'Fuel', merchant: 'Shell' }),
    tx({ kind: 'income', date: '2026-03-01', amount: 90000, category: 'Salary' }),
  ];

  it('resolves relative periods', () => {
    expect(parsePeriod('last month', TODAY)).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(parsePeriod('this year', TODAY).from).toBe('2026-01-01');
    expect(parsePeriod('in August', TODAY)).toMatchObject({ from: '2025-08-01', to: '2025-08-31' });
  });

  it('answers "how much did I spend on food last month?"', () => {
    const a = smartSearch('How much did I spend on food last month?', rows, [savings, card], TODAY);
    expect(a.total).toBe(5500);
    expect(a.headline).toContain('5,500');
    expect(a.understood).toBe(true);
  });

  it('answers "show fuel expenses in August"', () => {
    const a = smartSearch('Show fuel expenses in August', rows, [], TODAY);
    expect(a.transactions).toHaveLength(1);
    expect(a.transactions[0].merchant).toBe('Shell');
  });

  it('answers "which credit card was used most?"', () => {
    const a = smartSearch('Which credit card was used most?', rows, [savings, card], TODAY);
    expect(a.filters.intent).toBe('most-used-mode');
    expect(a.slices[0].name).toContain('Amazon Pay ICICI');
  });

  it('answers "what are my top 10 merchants?"', () => {
    const a = smartSearch('What are my top 10 merchants?', rows, [], TODAY);
    expect(a.filters.intent).toBe('top-merchants');
    expect(a.slices[0].name).toBe('Swiggy');
  });

  it('counts transactions above a threshold', () => {
    const a = smartSearch('How many transactions above 2000 this year?', rows, [], TODAY);
    expect(a.filters.intent).toBe('count');
    expect(a.filters.minAmount).toBe(2000);
    expect(a.headline).toContain('2 transactions');
  });

  it('scopes to income when asked about earnings', () => {
    const a = smartSearch('Show my salary income this year', rows, [], TODAY);
    expect(a.filters.kind).toBe('income');
    expect(a.total).toBe(90000);
  });
});
