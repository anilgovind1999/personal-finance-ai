import { describe, expect, it } from 'vitest';
import type { AppState, Transaction } from '@/types';
import { emptyState, reducer } from '@/store/reducer';
import { AUDIT_SYNC_LIMIT, estimateBytes, mergeDocs, mergeStates, oversizedDocs, splitState } from './model';

const META = { updatedAt: '2026-09-20T10:00:00.000Z', deviceId: 'dev_a' };

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', kind: 'expense', date: '2026-09-05', amount: 1200, merchant: 'Swiggy',
  category: 'Food & Dining', paymentMode: 'UPI', tags: [], attachmentIds: [], source: 'manual',
  createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z', ...over,
});

const withTxns = (items: Transaction[], over: Partial<AppState> = {}): AppState => ({
  ...emptyState(), transactions: items, ...over,
});

describe('splitting state for the cloud', () => {
  it('separates state into the four documents', () => {
    const docs = splitState(withTxns([txn()]), META);
    expect(docs.transactions.items).toHaveLength(1);
    expect(docs.core.settings.retentionDays).toBe(30);
    expect(docs.core.deviceId).toBe('dev_a');
  });

  it('sends only the user’s own categories, not the built-in list', () => {
    const state = reducer(emptyState(), {
      type: 'category/add',
      category: { name: 'Pet Care', kind: 'expense', subcategories: [] },
    });
    const docs = splitState(state, META);
    expect(docs.core.categories).toHaveLength(1);
    expect(docs.core.categories[0].name).toBe('Pet Care');
  });

  it('caps the audit log it mirrors', () => {
    const audit = Array.from({ length: 900 }, (_, i) => ({
      id: `a${i}`, at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      action: 'txn.create' as const, summary: 'x',
    }));
    expect(splitState({ ...emptyState(), audit }, META).activity.audit).toHaveLength(AUDIT_SYNC_LIMIT);
  });

  it('round-trips through split and merge', () => {
    const state = withTxns([txn(), txn({ id: 't2', amount: 500 })]);
    const restored = mergeDocs(splitState(state, META));
    expect(restored.transactions).toHaveLength(2);
    expect(restored.categories.length).toBeGreaterThan(20);
  });

  it('tolerates documents that are missing', () => {
    const restored = mergeDocs({ transactions: { ...META, items: [txn()] } });
    expect(restored.transactions).toHaveLength(1);
    expect(restored.accounts).toEqual([]);
  });

  it('flags a document approaching the size limit', () => {
    const heavy = Array.from({ length: 4000 }, (_, i) => txn({ id: `t${i}`, remarks: 'x'.repeat(200) }));
    const over = oversizedDocs(splitState(withTxns(heavy), META));
    expect(over.map((d) => d.name)).toContain('transactions');
    expect(estimateBytes(heavy)).toBeGreaterThan(700_000);
  });
});

describe('merging two devices', () => {
  it('keeps transactions added on both devices while offline', () => {
    const phone = withTxns([txn({ id: 'phone1' })]);
    const laptop = withTxns([txn({ id: 'laptop1' })]);
    const { state } = mergeStates(phone, laptop);
    expect(state.transactions.map((t) => t.id).sort()).toEqual(['laptop1', 'phone1']);
  });

  it('takes the more recently edited copy of the same transaction', () => {
    const older = withTxns([txn({ amount: 100, updatedAt: '2026-09-05T10:00:00.000Z' })]);
    const newer = withTxns([txn({ amount: 999, updatedAt: '2026-09-06T10:00:00.000Z' })]);
    expect(mergeStates(older, newer).state.transactions[0].amount).toBe(999);
    expect(mergeStates(newer, older).state.transactions[0].amount).toBe(999);
  });

  it('a deletion on one device is not undone by the other', () => {
    const withIt = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const deleted = reducer(withIt, { type: 'txn/remove', id: 't1' });
    // The laptop never saw the delete and still holds the transaction.
    const { state, notes } = mergeStates(deleted, withIt);
    expect(state.transactions).toHaveLength(0);
    expect(state.recycleBin).toHaveLength(1);
    expect(notes.join(' ')).toContain('stayed deleted');
  });

  it('restoring from the bin after a merge brings it back', () => {
    const withIt = reducer(emptyState(), { type: 'txn/add', txn: txn() });
    const deleted = reducer(withIt, { type: 'txn/remove', id: 't1' });
    const merged = mergeStates(deleted, withIt).state;
    const restored = reducer(merged, { type: 'recycle/restore', id: merged.recycleBin[0].id });
    expect(restored.transactions).toHaveLength(1);
  });

  it('merges the approval queue and keeps the reviewed copy', () => {
    const base = emptyState();
    const item = {
      id: 'p1', rawText: 'x', source: 'sms' as const, receivedAt: '2026-09-01T00:00:00.000Z',
      extraction: {} as never, draft: {} as never, status: 'pending' as const, attachmentIds: [],
    };
    const phone: AppState = { ...base, pending: [item] };
    const laptop: AppState = {
      ...base,
      pending: [{ ...item, status: 'approved', reviewedAt: '2026-09-02T00:00:00.000Z' }],
    };
    expect(mergeStates(phone, laptop).state.pending[0].status).toBe('approved');
  });

  it('unions the audit trail without duplicating shared entries', () => {
    const shared = { id: 'a1', at: '2026-09-01T00:00:00.000Z', action: 'txn.create' as const, summary: 'shared' };
    const phone: AppState = { ...emptyState(), audit: [shared, { ...shared, id: 'a2', at: '2026-09-03T00:00:00.000Z' }] };
    const laptop: AppState = { ...emptyState(), audit: [shared, { ...shared, id: 'a3', at: '2026-09-02T00:00:00.000Z' }] };
    const audit = mergeStates(phone, laptop).state.audit;
    expect(audit).toHaveLength(3);
    expect(audit[0].id).toBe('a2'); // newest first
  });

  it('takes accounts and settings from whichever device changed more recently', () => {
    const stale: AppState = {
      ...emptyState(),
      audit: [{ id: 'a', at: '2026-09-01T00:00:00.000Z', action: 'txn.create', summary: 'old' }],
      settings: { ...emptyState().settings, retentionDays: 30 },
    };
    const fresh: AppState = {
      ...emptyState(),
      audit: [{ id: 'b', at: '2026-09-10T00:00:00.000Z', action: 'settings.update', summary: 'new' }],
      settings: { ...emptyState().settings, retentionDays: 90 },
    };
    expect(mergeStates(stale, fresh).state.settings.retentionDays).toBe(90);
    expect(mergeStates(fresh, stale).state.settings.retentionDays).toBe(90);
  });

  it('is order-independent for transactions', () => {
    const a = withTxns([txn({ id: 'x' }), txn({ id: 'y' })]);
    const b = withTxns([txn({ id: 'y' }), txn({ id: 'z' })]);
    const one = mergeStates(a, b).state.transactions.map((t) => t.id).sort();
    const two = mergeStates(b, a).state.transactions.map((t) => t.id).sort();
    expect(one).toEqual(two);
    expect(one).toEqual(['x', 'y', 'z']);
  });

  it('merging with an empty remote loses nothing', () => {
    const local = withTxns([txn(), txn({ id: 't2' })]);
    expect(mergeStates(local, emptyState()).state.transactions).toHaveLength(2);
  });

  it('a first sign-in on a fresh device adopts the cloud copy', () => {
    const cloud = withTxns([txn(), txn({ id: 't2' })]);
    expect(mergeStates(emptyState(), cloud).state.transactions).toHaveLength(2);
  });
});
