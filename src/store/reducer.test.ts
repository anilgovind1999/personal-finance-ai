import { describe, expect, it } from 'vitest';
import type { AppState, ExtractionResult, PendingItem } from '@/types';
import { draftFromExtraction, emptyState, migrate, reducer } from './reducer';
import { parseMessage } from '@/engine/parser';
import { buildDemoState } from './demoData';

function pendingFrom(text: string, state: AppState): PendingItem {
  const extraction: ExtractionResult = parseMessage(text, { now: new Date(2026, 2, 14) });
  return {
    id: 'p1',
    rawText: text,
    source: 'sms',
    receivedAt: '2026-03-14T09:00:00.000Z',
    extraction,
    draft: draftFromExtraction(extraction, state.accounts),
    status: 'pending',
    attachmentIds: [],
  };
}

describe('approval workflow', () => {
  const base = emptyState();

  it('an AI-captured item does not touch the ledger until approved', () => {
    const item = pendingFrom('Paid ₹2,500 for fuel through HDFC Credit Card', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    expect(queued.pending).toHaveLength(1);
    expect(queued.transactions).toHaveLength(0);
  });

  it('approving posts exactly one transaction and marks the item approved', () => {
    const item = pendingFrom('Paid ₹2,500 for fuel through HDFC Credit Card', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    const approved = reducer(queued, { type: 'pending/approve', id: 'p1' });

    expect(approved.transactions).toHaveLength(1);
    const txn = approved.transactions[0];
    expect(txn.amount).toBe(2500);
    expect(txn.category).toBe('Fuel');
    expect(txn.paymentMode).toBe('Credit Card');
    expect(txn.source).toBe('sms');
    expect(txn.originId).toBe('p1');
    expect(approved.pending[0].status).toBe('approved');
    expect(approved.pending[0].postedTransactionId).toBe(txn.id);
  });

  it('edit-and-approve applies the reviewer edits', () => {
    const item = pendingFrom('Paid ₹2,500 for fuel', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    const approved = reducer(queued, {
      type: 'pending/approve',
      id: 'p1',
      draft: { amount: 2400, category: 'Travel', remarks: 'Corrected at review' },
    });
    expect(approved.transactions[0].amount).toBe(2400);
    expect(approved.transactions[0].category).toBe('Travel');
    expect(approved.transactions[0].remarks).toBe('Corrected at review');
  });

  it('approving twice cannot double-post', () => {
    const item = pendingFrom('Paid ₹2,500 for fuel', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    const once = reducer(queued, { type: 'pending/approve', id: 'p1' });
    const twice = reducer(once, { type: 'pending/approve', id: 'p1' });
    expect(twice.transactions).toHaveLength(1);
  });

  it('refuses to post an item with no amount', () => {
    const item = pendingFrom('had lunch with friends', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    const attempted = reducer(queued, { type: 'pending/approve', id: 'p1' });
    expect(attempted.transactions).toHaveLength(0);
    expect(attempted.pending[0].status).toBe('pending');
  });

  it('rejecting records the reason and posts nothing', () => {
    const item = pendingFrom('Paid ₹2,500 for fuel', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    const rejected = reducer(queued, { type: 'pending/reject', id: 'p1', reason: 'Duplicate' });
    expect(rejected.transactions).toHaveLength(0);
    expect(rejected.pending[0].status).toBe('rejected');
    expect(rejected.pending[0].rejectionReason).toBe('Duplicate');
  });

  it('a rejected item cannot later be approved', () => {
    const item = pendingFrom('Paid ₹2,500 for fuel', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    const rejected = reducer(queued, { type: 'pending/reject', id: 'p1' });
    const attempted = reducer(rejected, { type: 'pending/approve', id: 'p1' });
    expect(attempted.transactions).toHaveLength(0);
  });

  it('bulk approval posts every valid item and skips the rest', () => {
    const good = pendingFrom('Paid ₹250 for lunch', base);
    const bad = { ...pendingFrom('lunch with friends', base), id: 'p2' };
    const queued = reducer(base, { type: 'pending/add', items: [good, bad] });
    const approved = reducer(queued, { type: 'pending/approveMany', ids: ['p1', 'p2'] });
    expect(approved.transactions).toHaveLength(1);
    expect(approved.pending.find((p) => p.id === 'p2')?.status).toBe('pending');
  });

  it('links a captured card transaction to the matching account', () => {
    const withAccount: AppState = {
      ...base,
      accounts: [{
        id: 'acc9', bankName: 'HDFC Bank', accountName: 'Regalia', accountType: 'Credit Card',
        last4: '4521', creditLimit: 100000, openingBalance: 0, createdAt: '2026-01-01T00:00:00.000Z',
      }],
    };
    const item = pendingFrom('Rs.999 spent on HDFC Credit Card XX4521 at Swiggy', withAccount);
    expect(item.draft.accountId).toBe('acc9');
  });
});

describe('state management', () => {
  it('detaches transactions when an account is removed but keeps the history', () => {
    const state: AppState = {
      ...emptyState(),
      accounts: [{ id: 'a1', bankName: 'HDFC Bank', accountName: 'Main', accountType: 'Savings', last4: '1111', openingBalance: 0, createdAt: '' }],
      transactions: [{
        id: 't1', kind: 'expense', date: '2026-03-01', amount: 100, merchant: 'X', category: 'Other',
        paymentMode: 'UPI', accountId: 'a1', tags: [], attachmentIds: [], source: 'manual',
        createdAt: '', updatedAt: '',
      }],
    };
    const next = reducer(state, { type: 'account/remove', id: 'a1' });
    expect(next.transactions).toHaveLength(1);
    expect(next.transactions[0].accountId).toBeUndefined();
  });

  it('keeps custom categories and refuses duplicates', () => {
    const added = reducer(emptyState(), { type: 'category/add', category: { name: 'Pet Care', kind: 'expense', subcategories: ['Vet'] } });
    expect(added.categories.some((c) => c.name === 'Pet Care')).toBe(true);
    const again = reducer(added, { type: 'category/add', category: { name: 'pet care', kind: 'expense', subcategories: [] } });
    expect(again.categories.filter((c) => c.name.toLowerCase() === 'pet care')).toHaveLength(1);
  });

  it('adds a contribution to a goal and moves the balance', () => {
    const state = reducer(emptyState(), {
      type: 'goal/add',
      goal: { id: 'g1', name: 'Vacation', type: 'Vacation', targetAmount: 100000, currentAmount: 0, createdAt: '', contributions: [] },
    });
    const next = reducer(state, { type: 'goal/contribute', id: 'g1', contribution: { id: 'c1', date: '2026-03-01', amount: 15000 } });
    expect(next.goals[0].currentAmount).toBe(15000);
    expect(next.goals[0].contributions).toHaveLength(1);
  });

  it('replaces a budget for the same category, period and effective month', () => {
    const b = { id: 'b1', category: 'Fuel', period: 'monthly' as const, amount: 5000, effectiveFrom: '2026-03', createdAt: '' };
    const state = reducer(emptyState(), { type: 'budget/upsert', budget: b });
    const next = reducer(state, { type: 'budget/upsert', budget: { ...b, id: 'b2', amount: 6000 } });
    expect(next.budgets).toHaveLength(1);
    expect(next.budgets[0].amount).toBe(6000);
    expect(next.budgets[0].id).toBe('b1');
  });

  it('migrates a partial stored state without losing custom categories', () => {
    const migrated = migrate({
      transactions: [{ id: 't', kind: 'expense', date: '2026-01-01', amount: 1, merchant: 'm', category: 'Other', paymentMode: 'Cash', source: 'manual', createdAt: '', updatedAt: '' }],
      categories: [{ name: 'Pet Care', kind: 'expense', subcategories: [], custom: true }],
      settings: { theme: 'light' },
    });
    expect(migrated.transactions[0].tags).toEqual([]);
    expect(migrated.categories.some((c) => c.name === 'Pet Care')).toBe(true);
    expect(migrated.categories.some((c) => c.name === 'Food & Dining')).toBe(true);
    expect(migrated.settings.theme).toBe('light');
    expect(migrated.settings.alertThresholds).toEqual([80, 90, 100]);
  });

  it('migrates junk into a usable empty state', () => {
    expect(migrate(null).transactions).toEqual([]);
    expect(migrate('nonsense').categories.length).toBeGreaterThan(20);
  });
});

describe('sample data and first-run', () => {
  it('a fresh ledger has not been onboarded, so the tutorial runs once', () => {
    expect(emptyState().settings.onboarded).toBe(false);
  });

  it('clearing the sample data empties the ledger', () => {
    const demo = buildDemoState('2026-03-14');
    expect(demo.transactions.length).toBeGreaterThan(0);
    const cleared = reducer(demo, { type: 'data/clearSample' });
    expect(cleared.transactions).toHaveLength(0);
    expect(cleared.pending).toHaveLength(0);
    expect(cleared.settings.demoLoadedAt).toBeUndefined();
  });

  it('keeps the choices the person made for themselves', () => {
    const demo = buildDemoState('2026-03-14');
    const tuned = reducer(demo, {
      type: 'settings/update',
      settings: { theme: 'light', currency: 'GBP', retentionDays: 15 },
    });
    const cleared = reducer(tuned, { type: 'data/clearSample' });

    expect(cleared.settings.theme).toBe('light');
    expect(cleared.settings.currency).toBe('GBP');
    expect(cleared.settings.retentionDays).toBe(15);
    // And does not make them sit through the tutorial again.
    expect(cleared.settings.onboarded).toBe(true);
  });

  it('marks a demo ledger as sample data so it can be labelled', () => {
    expect(buildDemoState('2026-03-14').settings.demoLoadedAt).toBeTruthy();
  });
});
