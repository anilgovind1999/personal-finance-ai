import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '@/types';
import { buildReport, reportToCSV, transactionsToCSV } from './exporters';

const account: Account = {
  id: 'a1', bankName: 'HDFC Bank', accountName: 'Salary', accountType: 'Savings',
  last4: '4521', openingBalance: 50000, createdAt: '2026-01-01T00:00:00.000Z',
};

const card: Account = {
  id: 'a2', bankName: 'ICICI Bank', accountName: 'Amazon Pay', accountType: 'Credit Card',
  last4: '7788', cardName: 'Amazon Pay ICICI', creditLimit: 200000, statementDay: 18, dueDay: 5,
  openingBalance: 0, createdAt: '2026-01-01T00:00:00.000Z',
};

const txns: Transaction[] = [
  {
    id: 't1', kind: 'expense', date: '2026-03-05', amount: 1200, merchant: 'Swiggy, Kochi',
    category: 'Food & Dining', subcategory: 'Food Delivery', paymentMode: 'UPI', accountId: 'a1',
    tags: ['weekend'], attachmentIds: [], source: 'sms', remarks: 'Team "lunch"',
    createdAt: '2026-03-05T00:00:00.000Z', updatedAt: '2026-03-05T00:00:00.000Z',
  },
  {
    id: 't2', kind: 'expense', date: '2026-03-08', amount: 3000, merchant: 'Indian Oil',
    category: 'Fuel', paymentMode: 'Credit Card', accountId: 'a2', tags: [], attachmentIds: [],
    source: 'manual', createdAt: '2026-03-08T00:00:00.000Z', updatedAt: '2026-03-08T00:00:00.000Z',
  },
  {
    id: 't3', kind: 'income', date: '2026-03-01', amount: 90000, merchant: 'Acme',
    category: 'Salary', paymentMode: 'Net Banking', accountId: 'a1', tags: [], attachmentIds: [],
    source: 'manual', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
  },
];

const ctx = {
  transactions: txns,
  accounts: [account, card],
  budgets: [{ id: 'b1', category: 'Fuel', period: 'monthly' as const, amount: 5000, effectiveFrom: '2026-01', createdAt: '' }],
  goals: [],
  range: { from: '2026-03-01', to: '2026-03-31' },
  today: '2026-03-20',
};

describe('report building', () => {
  it('builds a monthly report with a correct summary', () => {
    const doc = buildReport('monthly', ctx);
    expect(doc.title).toBe('Monthly Expense Report');
    expect(doc.summary.find((s) => s.label === 'Total income')?.value).toContain('90,000');
    expect(doc.summary.find((s) => s.label === 'Total expenses')?.value).toContain('4,200');
    expect(doc.tables.some((t) => t.title === 'All transactions')).toBe(true);
  });

  it('scopes the income report to income rows only', () => {
    const doc = buildReport('income', ctx);
    const entries = doc.tables.find((t) => t.title === 'Income entries')!;
    expect(entries.rows).toHaveLength(1);
    expect(entries.rows[0][1]).toBe('Acme');
  });

  it('reports card position and utilisation', () => {
    const doc = buildReport('creditcard', ctx);
    const positions = doc.tables.find((t) => t.title === 'Card positions')!;
    expect(positions.rows[0]).toContain('····7788');
    expect(positions.rows[0]).toContain(1.5); // 3000 of a 200000 limit
  });

  it('reports budget utilisation and status', () => {
    const doc = buildReport('budget', ctx);
    const row = doc.tables[0].rows[0];
    expect(row[0]).toBe('Fuel');
    expect(row[5]).toBe(60); // 3000 of 5000
  });

  it('accumulates a running cash flow', () => {
    const doc = buildReport('cashflow', ctx);
    const flow = doc.tables.find((t) => t.title === 'Cash flow by month')!;
    expect(flow.rows[0][4]).toBe(85800); // 90000 in, 4200 out
  });
});

describe('CSV output', () => {
  it('escapes commas and quotes so columns never shift', () => {
    const csv = transactionsToCSV(txns, [account, card]);
    const lines = csv.split('\n');
    expect(lines[0].startsWith('Date,Type,Amount')).toBe(true);
    expect(csv).toContain('"Swiggy, Kochi"');
    expect(csv).toContain('"Team ""lunch"""');
    expect(lines).toHaveLength(4);
  });

  it('includes the resolved account and masked digits', () => {
    const csv = transactionsToCSV(txns, [account, card]);
    expect(csv).toContain('····7788');
    expect(csv).toContain('Amazon Pay ICICI');
  });

  it('serialises a report with every table', () => {
    const csv = reportToCSV(buildReport('category', ctx));
    expect(csv).toContain('Category Report');
    expect(csv).toContain('Spend by category');
    expect(csv).toContain('Subcategory detail');
  });
});
