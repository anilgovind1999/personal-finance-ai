import { describe, expect, it } from 'vitest';
import type { AppState, PendingItem, Transaction } from '@/types';
import { emptyState, migrate, purgeExpired, reducer } from './reducer';
import { parseMessage } from '@/engine/parser';
import { draftFromExtraction } from './reducer';

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', kind: 'expense', date: '2026-03-05', amount: 1200, merchant: 'Swiggy',
  category: 'Food & Dining', paymentMode: 'UPI', tags: [], attachmentIds: [], source: 'manual',
  createdAt: '2026-03-05T10:00:00.000Z', updatedAt: '2026-03-05T10:00:00.000Z', ...over,
});

function pendingFrom(text: string, state: AppState): PendingItem {
  const extraction = parseMessage(text, { now: new Date(2026, 2, 14) });
  return {
    id: 'p1', rawText: text, source: 'sms', receivedAt: '2026-03-14T09:00:00.000Z',
    extraction, draft: draftFromExtraction(extraction, state.accounts),
    status: 'pending', attachmentIds: [],
  };
}

describe('audit trail', () => {
  it('records a created transaction with a readable summary', () => {
    const s = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0].action).toBe('txn.create');
    expect(s.audit[0].summary).toContain('Swiggy');
    expect(s.audit[0].summary).toContain('1,200');
  });

  it('records field-level changes on an edit', () => {
    const s1 = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const s2 = reducer(s1, { type: 'txn/update', txn: { ...txn(), amount: 1500, category: 'Grocery' } });
    const record = s2.audit[0];
    expect(record.action).toBe('txn.update');
    const fields = record.changes!.map((c) => c.field);
    expect(fields).toContain('Amount');
    expect(fields).toContain('Category');
    expect(record.changes!.find((c) => c.field === 'Amount')).toMatchObject({ from: '1200', to: '1500' });
  });

  it('writes nothing when an edit changes nothing', () => {
    const s1 = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const s2 = reducer(s1, { type: 'txn/update', txn: txn() });
    expect(s2.audit).toHaveLength(1);
  });

  it('records an approval and what the reviewer overrode', () => {
    const base = emptyState();
    const item = pendingFrom('Paid ₹2,500 for fuel through HDFC Credit Card', base);
    const queued = reducer(base, { type: 'pending/add', items: [item] });
    const approved = reducer(queued, { type: 'pending/approve', id: 'p1', draft: { amount: 2400 } });
    const record = approved.audit[0];
    expect(record.action).toBe('pending.approve');
    expect(record.changes?.some((c) => c.field.includes('amount'))).toBe(true);
  });

  it('records a rejection and says nothing was posted', () => {
    const base = emptyState();
    const queued = reducer(base, { type: 'pending/add', items: [pendingFrom('Paid ₹250 for lunch', base)] });
    const rejected = reducer(queued, { type: 'pending/reject', id: 'p1' });
    expect(rejected.audit[0].action).toBe('pending.reject');
    expect(rejected.audit[0].summary).toContain('nothing was posted');
    expect(rejected.audit[0].recoverable).toBe(true);
  });

  it('is newest first and never rewritten', () => {
    let s = reducer(emptyState(), { type: 'txn/add', txn: txn({ id: 'a' }) });
    s = reducer(s, { type: 'txn/add', txn: txn({ id: 'b', merchant: 'Zomato' }) });
    expect(s.audit).toHaveLength(2);
    expect(s.audit[0].summary).toContain('Zomato');
    expect(s.audit[1].summary).toContain('Swiggy');
  });

  it('ignores a theme flip but records a real setting change', () => {
    const s1 = reducer(emptyState(), { type: 'settings/update', settings: { theme: 'light' } });
    expect(s1.audit).toHaveLength(0);
    const s2 = reducer(s1, { type: 'settings/update', settings: { retentionDays: 60 } });
    expect(s2.audit).toHaveLength(1);
    expect(s2.audit[0].summary).toContain('retentionDays');
  });

  it('records budgets, goals and accounts too', () => {
    let s = reducer(emptyState(), {
      type: 'budget/upsert',
      budget: { id: 'b1', category: 'Fuel', period: 'monthly', amount: 5000, effectiveFrom: '2026-03', createdAt: '' },
    });
    expect(s.audit[0].summary).toContain('Fuel monthly budget');
    s = reducer(s, {
      type: 'goal/add',
      goal: { id: 'g1', name: 'Japan Trip', type: 'Vacation', targetAmount: 350000, currentAmount: 0, createdAt: '', contributions: [] },
    });
    expect(s.audit[0].summary).toContain('Japan Trip');
  });
});

describe('recycle bin', () => {
  it('moves a deleted transaction to the bin instead of dropping it', () => {
    const s1 = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const s2 = reducer(s1, { type: 'txn/remove', id: 't1' });
    expect(s2.transactions).toHaveLength(0);
    expect(s2.recycleBin).toHaveLength(1);
    expect(s2.recycleBin[0].transaction?.merchant).toBe('Swiggy');
    expect(s2.audit[0].recoverable).toBe(true);
  });

  it('sets the expiry from the retention setting', () => {
    const base = reducer(emptyState(), { type: 'settings/update', settings: { retentionDays: 30 } });
    const s = reducer(reducer(base, { type: 'txn/add', txn: txn() }), { type: 'txn/remove', id: 't1' });
    const item = s.recycleBin[0];
    const days = Math.round(
      (new Date(item.expiresAt).getTime() - new Date(item.deletedAt).getTime()) / 86400000,
    );
    expect(days).toBe(30);
  });

  it('restores a transaction back into the ledger', () => {
    const s1 = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const s2 = reducer(s1, { type: 'txn/remove', id: 't1' });
    const s3 = reducer(s2, { type: 'recycle/restore', id: s2.recycleBin[0].id });
    expect(s3.transactions).toHaveLength(1);
    expect(s3.transactions[0].id).toBe('t1');
    expect(s3.recycleBin).toHaveLength(0);
    expect(s3.audit[0].action).toBe('txn.restore');
  });

  it('does not duplicate a transaction that was recreated meanwhile', () => {
    const s1 = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const s2 = reducer(s1, { type: 'txn/remove', id: 't1' });
    const s3 = reducer(s2, { type: 'txn/add', txn: txn() });
    const s4 = reducer(s3, { type: 'recycle/restore', id: s2.recycleBin[0].id });
    expect(s4.transactions).toHaveLength(1);
  });

  it('purging removes it for good and says so', () => {
    const s1 = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const s2 = reducer(s1, { type: 'txn/remove', id: 't1' });
    const s3 = reducer(s2, { type: 'recycle/purge', id: s2.recycleBin[0].id });
    expect(s3.recycleBin).toHaveLength(0);
    expect(s3.transactions).toHaveLength(0);
    expect(s3.audit[0].summary).toContain('Permanently deleted');
  });

  it('keeps a rejected capture recoverable when removed from history', () => {
    const base = emptyState();
    const queued = reducer(base, { type: 'pending/add', items: [pendingFrom('Paid ₹250 for lunch', base)] });
    const rejected = reducer(queued, { type: 'pending/reject', id: 'p1' });
    const removed = reducer(rejected, { type: 'pending/remove', id: 'p1' });
    expect(removed.pending).toHaveLength(0);
    expect(removed.recycleBin[0].pending?.status).toBe('rejected');

    const restored = reducer(removed, { type: 'recycle/restore', id: removed.recycleBin[0].id });
    expect(restored.pending).toHaveLength(1);
  });

  it('purges only items past their expiry', () => {
    const now = new Date('2026-04-01T00:00:00.000Z');
    const state: AppState = {
      ...emptyState(),
      recycleBin: [
        { id: 'old', kind: 'transaction', deletedAt: '2026-02-01T00:00:00.000Z', expiresAt: '2026-03-03T00:00:00.000Z', transaction: txn() },
        { id: 'fresh', kind: 'transaction', deletedAt: '2026-03-30T00:00:00.000Z', expiresAt: '2026-04-29T00:00:00.000Z', transaction: txn({ id: 't2' }) },
      ],
    };
    const purged = purgeExpired(state, now);
    expect(purged.recycleBin.map((d) => d.id)).toEqual(['fresh']);
  });

  it('survives a save and reload', () => {
    const s1 = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const s2 = reducer(s1, { type: 'txn/remove', id: 't1' });
    const restored = migrate(JSON.parse(JSON.stringify(s2)));
    expect(restored.recycleBin).toHaveLength(1);
    expect(restored.audit.length).toBeGreaterThan(0);
  });

  it('an older backup with no audit or bin still loads', () => {
    const legacy = migrate({ transactions: [], settings: { theme: 'dark' } });
    expect(legacy.audit).toEqual([]);
    expect(legacy.recycleBin).toEqual([]);
    expect(legacy.settings.retentionDays).toBe(30);
  });
});
