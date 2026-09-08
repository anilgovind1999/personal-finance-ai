import type { ExtractionResult, PendingDraft, PendingItem, RecurringRule } from '@/types';
import { daysInMonth, monthKey, todayISO, uid } from '@/lib/utils';

/**
 * Recurring rules — rent, EMIs, SIPs, subscriptions, salary.
 *
 * A rule never writes to the ledger. When one falls due it proposes an entry
 * into the approval queue exactly like an AI-captured message would, so the
 * "nothing posts unreviewed" rule holds for automated entries too. The amount
 * on a bill often differs from the amount you expected, and that difference is
 * the whole reason to look before it lands.
 */

/** The date a rule falls due in a given month, clamped to the month's length. */
export function dueDate(rule: RecurringRule, month: string): string {
  const day = Math.min(Math.max(1, rule.dayOfMonth), daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function isDue(rule: RecurringRule, today = todayISO()): boolean {
  if (!rule.active) return false;
  const month = monthKey(today);
  if (rule.lastGeneratedMonth && rule.lastGeneratedMonth >= month) return false;
  // Only once the day has actually arrived.
  return dueDate(rule, month) <= today;
}

/** Rules that have fallen due and have not yet been proposed for this month. */
export function dueRules(rules: RecurringRule[], today = todayISO()): RecurringRule[] {
  return rules.filter((r) => isDue(r, today));
}

function extractionFor(rule: RecurringRule, date: string): ExtractionResult {
  const certain = <T,>(value: T) => ({ value, confidence: 1, evidence: 'recurring rule' });
  return {
    kind: rule.kind,
    amount: certain(rule.amount),
    date: certain(date),
    merchant: certain(rule.merchant),
    category: certain(rule.category),
    subcategory: rule.subcategory ? certain(rule.subcategory) : undefined,
    paymentMode: certain(rule.paymentMode),
    bank: certain(null),
    last4: certain(null),
    location: certain(null),
    // Stated by the user, not inferred — but the amount is still only expected,
    // so this is never treated as more certain than the reviewer's own eyes.
    confidence: 0.9,
    reasons: [
      `Generated from your recurring rule "${rule.label}".`,
      `Expected ${rule.kind === 'income' ? 'credit' : 'charge'} on day ${rule.dayOfMonth} of each month.`,
      'Check the amount against the real bill before approving.',
    ],
    isTransaction: true,
  };
}

export function draftFor(rule: RecurringRule, date: string): PendingDraft {
  return {
    kind: rule.kind,
    date,
    amount: rule.amount,
    merchant: rule.merchant,
    category: rule.category,
    subcategory: rule.subcategory,
    paymentMode: rule.paymentMode,
    accountId: rule.accountId,
    remarks: rule.remarks,
    tags: ['recurring'],
  };
}

export interface GeneratedEntry {
  item: PendingItem;
  ruleId: string;
  month: string;
}

/** Builds the pending items for every rule that is due, ready to be queued. */
export function generateDue(rules: RecurringRule[], today = todayISO()): GeneratedEntry[] {
  const month = monthKey(today);
  return dueRules(rules, today).map((rule) => {
    const date = dueDate(rule, month);
    return {
      ruleId: rule.id,
      month,
      item: {
        id: uid('pend'),
        rawText: `${rule.label} — recurring ${rule.kind} due ${date}`,
        source: 'manual',
        receivedAt: new Date().toISOString(),
        extraction: extractionFor(rule, date),
        draft: draftFor(rule, date),
        status: 'pending',
        attachmentIds: [],
      },
    };
  });
}

/** Next date a rule will fall due, for display. */
export function nextDue(rule: RecurringRule, today = todayISO()): string {
  const month = monthKey(today);
  const thisMonth = dueDate(rule, month);
  const alreadyDone = rule.lastGeneratedMonth ? rule.lastGeneratedMonth >= month : false;
  if (!alreadyDone && thisMonth > today) return thisMonth;
  const [y, m] = month.split('-').map(Number);
  const next = new Date(y, m, 1);
  return dueDate(rule, `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
}

/** Monthly totals implied by the active rules, for the summary line. */
export function recurringTotals(rules: RecurringRule[]): { expense: number; income: number; net: number } {
  const active = rules.filter((r) => r.active);
  const expense = active.filter((r) => r.kind === 'expense').reduce((a, r) => a + r.amount, 0);
  const income = active.filter((r) => r.kind === 'income').reduce((a, r) => a + r.amount, 0);
  return { expense, income, net: income - expense };
}
