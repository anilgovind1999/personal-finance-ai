import { describe, expect, it } from 'vitest';
import type { AppState, PendingItem, Transaction } from '@/types';
import { draftFromExtraction, emptyState, reducer } from '@/store/reducer';
import { parseMessage } from '@/engine/parser';
import { compareCaptures, findMatch, merchantAffinity, mergeCaptures } from './reconcile';

const NOW = new Date(2026, 2, 14, 12, 0, 0);

function capture(
  id: string,
  text: string,
  source: PendingItem['source'],
  state: AppState = emptyState(),
): PendingItem {
  const extraction = parseMessage(text, { now: NOW });
  return {
    id,
    rawText: text,
    source,
    receivedAt: NOW.toISOString(),
    extraction,
    draft: draftFromExtraction(extraction, state.accounts),
    status: 'pending',
    attachmentIds: [],
  };
}

/** The bank's text, sent the instant the card is used. */
const CARD_SMS =
  'Rs 2,499.00 spent on HDFC Bank Card XX4417 at BIGBASKET on 12-03-26. Not you? Call 18002586161.';

/** The merchant's receipt, which lands a few minutes later and knows more. */
const ORDER_EMAIL =
  'Your bigbasket order BB2200871 is confirmed. Order total Rs 2499.00 paid using card ending 4417 on 12 Mar 2026.';

describe('cross-referencing a card SMS against the confirmation email', () => {
  it('folds the email into the SMS already waiting for review', () => {
    const base = emptyState();
    const withSms = reducer(base, { type: 'pending/add', items: [capture('p1', CARD_SMS, 'sms')] });
    const withBoth = reducer(withSms, { type: 'pending/add', items: [capture('p2', ORDER_EMAIL, 'bank')] });

    expect(withBoth.pending).toHaveLength(1);
    expect(withBoth.pending[0].id).toBe('p1');
    expect(withBoth.pending[0].corroboration).toHaveLength(1);
    expect(withBoth.pending[0].corroboration?.[0].source).toBe('bank');
  });

  it('raises confidence, because two independent sources agreeing is itself evidence', () => {
    const sms = capture('p1', CARD_SMS, 'sms');
    const email = capture('p2', ORDER_EMAIL, 'bank');
    const merged = mergeCaptures(sms, email);

    expect(merged.extraction.confidence).toBeGreaterThan(sms.extraction.confidence);
    expect(merged.extraction.reasons.join(' ')).toContain('Cross-checked');
  });

  it('still posts one transaction, not two, when the merged item is approved', () => {
    const base = emptyState();
    const withSms = reducer(base, { type: 'pending/add', items: [capture('p1', CARD_SMS, 'sms')] });
    const withBoth = reducer(withSms, { type: 'pending/add', items: [capture('p2', ORDER_EMAIL, 'bank')] });
    const approved = reducer(withBoth, { type: 'pending/approve', id: 'p1' });

    expect(approved.transactions).toHaveLength(1);
    expect(approved.transactions[0].amount).toBe(2499);
  });

  it('carries the attachments of both captures onto the surviving item', () => {
    const sms = { ...capture('p1', CARD_SMS, 'sms'), attachmentIds: ['a1'] };
    const email = { ...capture('p2', ORDER_EMAIL, 'bank'), attachmentIds: ['a2'] };
    expect(mergeCaptures(sms, email).attachmentIds).toEqual(['a1', 'a2']);
  });
});

describe('what must never be merged', () => {
  it('keeps two different shops that happen to charge the same amount on the same day', () => {
    const base = emptyState();
    const one = capture('p1', 'Rs 500 spent on HDFC Bank Card XX4417 at CAFE COFFEE DAY on 12-03-26.', 'sms');
    const two = capture('p2', 'Rs 500 spent on HDFC Bank Card XX4417 at RELIANCE FRESH on 12-03-26.', 'sms');

    const after = reducer(reducer(base, { type: 'pending/add', items: [one] }), {
      type: 'pending/add',
      items: [two],
    });
    expect(after.pending).toHaveLength(2);
  });

  it('keeps two payments made on different cards', () => {
    const a = capture('p1', 'Rs 999 spent on HDFC Bank Card XX4417 at SWIGGY on 12-03-26.', 'sms');
    const b = capture('p2', 'Rs 999 spent on HDFC Bank Card XX8890 at SWIGGY on 12-03-26.', 'sms');
    expect(findMatch(b, [a], [], NOW).verdict).toBe('distinct');
  });

  it('keeps an expense and an income of the same size apart', () => {
    const spent = capture('p1', 'Rs 5,000 debited from A/C XX1180 on 12-03-26 to RENT', 'sms');
    const paid = capture('p2', 'Rs 5,000 credited to A/C XX1180 on 12-03-26 salary', 'sms');
    expect(findMatch(paid, [spent], [], NOW).verdict).toBe('distinct');
  });

  it('will not reach back further than three days', () => {
    const sms = capture('p1', 'Rs 2,499 spent on HDFC Bank Card XX4417 at BIGBASKET on 05-03-26.', 'sms');
    const email = capture('p2', ORDER_EMAIL, 'bank');
    expect(findMatch(email, [sms], [], NOW).verdict).toBe('distinct');
  });

  it('treats a one-rupee difference as a different payment', () => {
    const a = capture('p1', 'Rs 2,499 spent on HDFC Bank Card XX4417 at BIGBASKET on 12-03-26.', 'sms');
    const b = capture('p2', 'Rs 2,500 spent on HDFC Bank Card XX4417 at BIGBASKET on 12-03-26.', 'sms');
    expect(findMatch(b, [a], [], NOW).verdict).toBe('distinct');
  });

  it('does not merge into an item the reviewer has already dealt with', () => {
    const sms = { ...capture('p1', CARD_SMS, 'sms'), status: 'approved' as const };
    expect(findMatch(capture('p2', ORDER_EMAIL, 'bank'), [sms], [], NOW).pendingId).toBeUndefined();
  });
});

describe('when the evidence is only suggestive', () => {
  it('flags rather than merges, so the reviewer decides', () => {
    const base = emptyState();
    // Neither names a card, and one merchant is unidentified: enough to raise an
    // eyebrow, not enough to destroy a record.
    const a = capture('p1', 'Paid Rs 1,200 to SPENCERS on 12-03-26', 'sms');
    const b = capture('p2', 'UPI payment of Rs 1,200 on 12-03-26 completed', 'upi');

    const match = findMatch(b, [a], [], NOW);
    expect(match.verdict).toBe('possible');

    const after = reducer(reducer(base, { type: 'pending/add', items: [a] }), {
      type: 'pending/add',
      items: [b],
    });
    expect(after.pending).toHaveLength(2);
    expect(after.pending[0].possibleDuplicateOf?.pendingId).toBe('p1');
  });

  it('never silently merges into money already posted to the ledger', () => {
    const ledger: Transaction = {
      id: 't1',
      kind: 'expense',
      date: '2026-03-12',
      amount: 2499,
      merchant: 'BigBasket',
      category: 'Groceries',
      paymentMode: 'Credit Card',
      tags: [],
      attachmentIds: [],
      source: 'sms',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    const match = findMatch(capture('p2', ORDER_EMAIL, 'bank'), [], [ledger], NOW);
    expect(match.verdict).toBe('possible');
    expect(match.transactionId).toBe('t1');
  });
});

describe('merge details', () => {
  it('recognises the same message pasted a second time', () => {
    const first = capture('p1', CARD_SMS, 'sms');
    const again = capture('p2', CARD_SMS, 'sms');
    expect(findMatch(again, [first], [], NOW).verdict).toBe('duplicate');
  });

  it('fills a gap in the queued item without overwriting what the reviewer typed', () => {
    const vague = capture('p1', 'Rs 2,499 debited on 12-03-26 card XX4417', 'sms');
    const edited: PendingItem = { ...vague, draft: { ...vague.draft, merchant: 'BigBasket', remarks: 'weekly shop' } };
    const email = capture('p2', ORDER_EMAIL, 'bank');
    const merged = mergeCaptures(edited, email);

    expect(merged.draft.merchant).toBe('BigBasket');
    expect(merged.draft.remarks).toBe('weekly shop');
    expect(merged.id).toBe('p1');
  });

  it('takes the better category when the queued item could not work one out', () => {
    const vague = capture('p1', 'Rs 2,499 debited on 12-03-26 card XX4417', 'sms');
    expect(vague.draft.category).toBe('Other');
    const merged = mergeCaptures(vague, capture('p2', ORDER_EMAIL, 'bank'));
    expect(merged.draft.category).not.toBe('Other');
  });
});

describe('merchant affinity', () => {
  it('sees through corporate suffixes and casing', () => {
    expect(merchantAffinity('AMAZON PAY INDIA PVT LTD', 'Amazon')).toBeGreaterThan(0.5);
  });

  it('reports disagreement between two identified merchants', () => {
    expect(merchantAffinity('Swiggy', 'Zomato')).toBeLessThan(0);
  });

  it('stays neutral when one side never identified a merchant', () => {
    expect(merchantAffinity('Unknown merchant', 'Swiggy')).toBe(0);
  });
});

describe('the comparison gates', () => {
  const facts = {
    kind: 'expense',
    amount: 2499,
    date: '2026-03-12',
    merchant: 'BigBasket',
    last4: '4417',
    bank: 'HDFC Bank',
    paymentMode: 'Credit Card',
    source: 'sms' as const,
    rawText: CARD_SMS,
  };

  it('refuses to compare a capture with no amount', () => {
    expect(compareCaptures({ ...facts, amount: 0 }, facts).verdict).toBe('distinct');
  });

  it('scores a full agreement highly', () => {
    const match = compareCaptures({ ...facts, source: 'bank', rawText: ORDER_EMAIL }, facts);
    expect(match.verdict).toBe('duplicate');
    expect(match.score).toBeGreaterThan(0.55);
  });
});
