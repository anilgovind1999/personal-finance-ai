import { describe, expect, it } from 'vitest';
import type { RecurringRule, Transaction } from '@/types';
import { classifyIncomeSources, incomeVolatility, summariseIncome } from './income';
import { dueDate, dueRules, generateDue, isDue, nextDue, recurringTotals } from './recurring';
import { emptyState, reducer } from '@/store/reducer';

const TODAY = '2026-09-20';

let n = 0;
const inc = (over: Partial<Transaction> = {}): Transaction => {
  n += 1;
  return {
    id: `i${n}`, kind: 'income', date: '2026-09-01', amount: 100000, merchant: 'Acme Technologies',
    category: 'Salary', paymentMode: 'Net Banking', tags: [], attachmentIds: [], source: 'manual',
    createdAt: '', updatedAt: '', ...over,
  };
};

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1', kind: 'expense', label: 'House rent', amount: 24000, category: 'Rent/Housing',
  merchant: 'Landlord', paymentMode: 'Net Banking', dayOfMonth: 3, active: true,
  createdAt: '', ...over,
});

describe('income tracking', () => {
  const salary = ['2026-06', '2026-07', '2026-08', '2026-09'].map((m) =>
    inc({ date: `${m}-01`, amount: 120000 }),
  );
  const freelance = [
    inc({ date: '2026-07-14', amount: 30000, merchant: 'Client A', category: 'Freelancing' }),
    inc({ date: '2026-09-08', amount: 45000, merchant: 'Client A', category: 'Freelancing' }),
  ];
  const bonus = inc({ date: '2026-08-20', amount: 85000, merchant: 'Acme Technologies', category: 'Bonus' });
  const all = [...salary, ...freelance, bonus];

  it('reports the monthly and annual totals the spec asks for', () => {
    const s = summariseIncome(all, TODAY);
    expect(s.thisMonth).toBe(165000); // 120k salary + 45k freelance in September
    expect(s.thisYear).toBe(640000); // 4×120k salary + 75k freelance + 85k bonus
    expect(s.monthlyAverage).toBeGreaterThan(0);
    expect(s.annualisedRunRate).toBe(Math.round(s.monthlyAverage * 12 * 100) / 100);
  });

  it('classifies a four-month salary as recurring', () => {
    const salarySource = classifyIncomeSources(all, TODAY).find((x) => x.category === 'Salary')!;
    expect(salarySource.recurring).toBe(true);
    expect(salarySource.months).toBe(4);
    expect(salarySource.reason).toContain('6 months');
  });

  it('classifies irregular freelancing as variable', () => {
    const client = classifyIncomeSources(all, TODAY).find((x) => x.category === 'Freelancing')!;
    expect(client.recurring).toBe(false);
    expect(client.reason).toContain('Irregular');
  });

  it('classifies a one-off bonus as variable', () => {
    const b = classifyIncomeSources(all, TODAY).find((x) => x.category === 'Bonus')!;
    expect(b.recurring).toBe(false);
  });

  it('treats a newly started salary as recurring after two months', () => {
    const fresh = ['2026-08', '2026-09'].map((m) => inc({ date: `${m}-01`, amount: 90000 }));
    const s = classifyIncomeSources(fresh, TODAY)[0];
    expect(s.recurring).toBe(true);
    expect(s.reason).toContain('Salary received in 2 months');
  });

  it('does not call a single salary payment dependable yet', () => {
    const one = [inc({ date: '2026-09-01', amount: 90000 })];
    expect(classifyIncomeSources(one, TODAY)[0].recurring).toBe(false);
  });

  it('splits recurring from variable income', () => {
    const s = summariseIncome(all, TODAY);
    expect(s.recurringMonthly).toBeGreaterThan(0);
    expect(s.variableMonthly).toBeGreaterThan(0);
    expect(Math.round(s.recurringMonthly + s.variableMonthly)).toBe(Math.round(s.monthlyAverage));
    expect(s.stabilityPercent).toBeGreaterThan(50);
    expect(s.stabilityPercent).toBeLessThan(100);
  });

  it('averages only over months that had income', () => {
    // A gap month must not halve the average.
    const sparse = [inc({ date: '2026-07-01', amount: 100000 }), inc({ date: '2026-09-01', amount: 100000 })];
    expect(summariseIncome(sparse, TODAY).monthlyAverage).toBe(100000);
  });

  it('measures how much income swings month to month', () => {
    const steady = summariseIncome(salary, TODAY);
    expect(incomeVolatility(steady)).toBe(0);
    expect(incomeVolatility(summariseIncome(all, TODAY))).toBeGreaterThan(0);
  });

  it('reports zeros rather than failing on an empty ledger', () => {
    const s = summariseIncome([], TODAY);
    expect(s.thisMonth).toBe(0);
    expect(s.stabilityPercent).toBe(0);
    expect(s.sources).toEqual([]);
  });
});

describe('recurring rules', () => {
  it('clamps a day-31 rule to the end of a short month', () => {
    expect(dueDate(rule({ dayOfMonth: 31 }), '2026-02')).toBe('2026-02-28');
    expect(dueDate(rule({ dayOfMonth: 31 }), '2026-09')).toBe('2026-09-30');
  });

  it('is due once the day has arrived, not before', () => {
    expect(isDue(rule({ dayOfMonth: 3 }), '2026-09-20')).toBe(true);
    expect(isDue(rule({ dayOfMonth: 25 }), '2026-09-20')).toBe(false);
  });

  it('does not fire twice in the same month', () => {
    expect(isDue(rule({ lastGeneratedMonth: '2026-09' }), TODAY)).toBe(false);
    expect(isDue(rule({ lastGeneratedMonth: '2026-08' }), TODAY)).toBe(true);
  });

  it('ignores an inactive rule', () => {
    expect(isDue(rule({ active: false }), TODAY)).toBe(false);
  });

  it('generates a pending item, never a ledger entry', () => {
    const [g] = generateDue([rule()], TODAY);
    expect(g.item.status).toBe('pending');
    expect(g.item.draft.amount).toBe(24000);
    expect(g.item.draft.date).toBe('2026-09-03');
    expect(g.item.draft.tags).toContain('recurring');
    expect(g.item.extraction.reasons.join(' ')).toContain('Check the amount');
  });

  it('says when the rule next falls due', () => {
    expect(nextDue(rule({ dayOfMonth: 25 }), TODAY)).toBe('2026-09-25');
    expect(nextDue(rule({ dayOfMonth: 3 }), TODAY)).toBe('2026-10-03');
  });

  it('totals the monthly commitment', () => {
    const totals = recurringTotals([
      rule({ id: 'a', amount: 24000 }),
      rule({ id: 'b', amount: 15000 }),
      rule({ id: 'c', kind: 'income', amount: 120000, label: 'Salary' }),
      rule({ id: 'd', amount: 9999, active: false }),
    ]);
    expect(totals.expense).toBe(39000);
    expect(totals.income).toBe(120000);
    expect(totals.net).toBe(81000);
  });

  it('running due rules queues them for approval and does not post', () => {
    const withRule = reducer(emptyState(), { type: 'recurring/upsert', rule: rule() });
    const ran = reducer(withRule, { type: 'recurring/runDue', today: TODAY });
    expect(ran.pending).toHaveLength(1);
    expect(ran.transactions).toHaveLength(0);
    expect(ran.recurring[0].lastGeneratedMonth).toBe('2026-09');
  });

  it('running twice in a month adds nothing further', () => {
    const withRule = reducer(emptyState(), { type: 'recurring/upsert', rule: rule() });
    const once = reducer(withRule, { type: 'recurring/runDue', today: TODAY });
    const twice = reducer(once, { type: 'recurring/runDue', today: TODAY });
    expect(twice.pending).toHaveLength(1);
  });

  it('approving a generated entry is what puts it in the ledger', () => {
    const withRule = reducer(emptyState(), { type: 'recurring/upsert', rule: rule() });
    const ran = reducer(withRule, { type: 'recurring/runDue', today: TODAY });
    const approved = reducer(ran, { type: 'pending/approve', id: ran.pending[0].id });
    expect(approved.transactions).toHaveLength(1);
    expect(approved.transactions[0].amount).toBe(24000);
    expect(approved.transactions[0].category).toBe('Rent/Housing');
  });

  it('records the rule in the audit trail by name', () => {
    const s = reducer(emptyState(), { type: 'recurring/upsert', rule: rule() });
    expect(s.audit[0].summary).toContain('House rent');
  });

  it('lists only what is actually due', () => {
    const rules = [rule({ id: 'a', dayOfMonth: 3 }), rule({ id: 'b', dayOfMonth: 28 })];
    expect(dueRules(rules, TODAY).map((r) => r.id)).toEqual(['a']);
  });
});
