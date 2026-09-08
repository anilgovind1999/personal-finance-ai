import type {
  Account, AppState, Budget, CategoryDef, DeletedItem, Goal, GoalContribution, PendingDraft,
  PendingItem, RecurringRule, Settings, Transaction,
} from '@/types';
import { describeAction } from './audit';
import { generateDue } from '@/engine/recurring';
import { findMatch, mergeCaptures } from '@/engine/reconcile';
import { DEFAULT_CATEGORIES } from '@/data/categories';
import { round2, todayISO, uid } from '@/lib/utils';

export const STATE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  currency: 'INR',
  liveRates: false,
  usageAnalytics: true,
  locale: 'en-IN',
  monthStartDay: 1,
  alertThresholds: [80, 90, 100],
  emergencyFundMonths: 6,
  retentionDays: 30,
  confirmDestructive: true,
  autoApproveThreshold: null,
  onboarded: false,
};

export function emptyState(): AppState {
  return {
    version: STATE_VERSION,
    accounts: [],
    transactions: [],
    pending: [],
    budgets: [],
    goals: [],
    recurring: [],
    categories: DEFAULT_CATEGORIES,
    audit: [],
    recycleBin: [],
    settings: DEFAULT_SETTINGS,
  };
}

/** Newest first, and bounded so a long-lived install cannot grow without limit. */
const AUDIT_LIMIT = 2000;

function binEntry(state: AppState, kind: DeletedItem['kind'], payload: Partial<DeletedItem>): DeletedItem {
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + Math.max(1, state.settings.retentionDays));
  return {
    id: uid('del'),
    kind,
    deletedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    ...payload,
  };
}

/** Drops recycle-bin items whose retention window has passed. */
export function purgeExpired(state: AppState, now = new Date()): AppState {
  const kept = state.recycleBin.filter((d) => d.expiresAt > now.toISOString());
  return kept.length === state.recycleBin.length ? state : { ...state, recycleBin: kept };
}

export type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'reset' }
  | { type: 'replaceAll'; state: AppState }
  | { type: 'account/add'; account: Account }
  | { type: 'account/update'; account: Account }
  | { type: 'account/remove'; id: string }
  | { type: 'txn/add'; txn: Transaction }
  | { type: 'txn/addMany'; txns: Transaction[] }
  | { type: 'txn/update'; txn: Transaction }
  | { type: 'txn/remove'; id: string }
  | { type: 'pending/add'; items: PendingItem[] }
  | { type: 'pending/updateDraft'; id: string; draft: Partial<PendingDraft> }
  | { type: 'pending/approve'; id: string; draft?: Partial<PendingDraft> }
  | { type: 'pending/approveMany'; ids: string[] }
  | { type: 'pending/reject'; id: string; reason?: string }
  | { type: 'pending/remove'; id: string }
  | { type: 'pending/clearReviewed' }
  | { type: 'recycle/restore'; id: string }
  | { type: 'recycle/purge'; id: string }
  | { type: 'recycle/purgeExpired' }
  | { type: 'recurring/runDue'; today?: string }
  | { type: 'budget/upsert'; budget: Budget }
  | { type: 'budget/remove'; id: string }
  | { type: 'goal/add'; goal: Goal }
  | { type: 'goal/update'; goal: Goal }
  | { type: 'goal/remove'; id: string }
  | { type: 'goal/contribute'; id: string; contribution: GoalContribution }
  | { type: 'recurring/upsert'; rule: RecurringRule }
  | { type: 'recurring/remove'; id: string }
  | { type: 'category/add'; category: CategoryDef }
  | { type: 'category/addSubcategory'; category: string; subcategory: string }
  | { type: 'category/remove'; name: string }
  | { type: 'settings/update'; settings: Partial<Settings> };

/**
 * Adds one capture to the review queue, folding it into an existing one when
 * the two describe the same spend.
 *
 * A confirmation email arriving after the card SMS should sharpen the entry
 * already waiting, not sit beside it as a second expense. Where the evidence
 * falls short of certainty both are kept and the newer one carries a warning,
 * because a duplicate the reviewer can see is a smaller harm than a real
 * transaction quietly absorbed into another.
 */
function absorbCapture(state: AppState, item: PendingItem): AppState {
  const match = findMatch(item, state.pending, state.transactions);

  if (match.verdict === 'duplicate' && match.pendingId) {
    return {
      ...state,
      pending: state.pending.map((p) =>
        p.id === match.pendingId ? mergeCaptures(p, item) : p,
      ),
    };
  }

  const flagged: PendingItem =
    match.verdict === 'possible'
      ? {
          ...item,
          possibleDuplicateOf: {
            pendingId: match.pendingId,
            transactionId: match.transactionId,
            reason: match.reasons.join(' '),
          },
        }
      : item;

  return { ...state, pending: [flagged, ...state.pending] };
}

/** Builds the ledger row that an approved pending item becomes. */
export function transactionFromDraft(item: PendingItem, draft: PendingDraft): Transaction {
  const now = new Date().toISOString();
  return {
    id: uid('txn'),
    kind: draft.kind,
    date: draft.date,
    amount: round2(draft.amount),
    merchant: draft.merchant.trim() || 'Unknown',
    category: draft.category,
    subcategory: draft.subcategory,
    paymentMode: draft.paymentMode,
    accountId: draft.accountId,
    remarks: draft.remarks,
    tags: draft.tags,
    attachmentIds: item.attachmentIds,
    location: draft.location,
    source: item.source,
    originId: item.id,
    createdAt: now,
    updatedAt: now,
  };
}

function baseReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
    case 'replaceAll':
      return action.state;

    case 'reset':
      return emptyState();

    case 'account/add':
      return { ...state, accounts: [...state.accounts, action.account] };

    case 'account/update':
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === action.account.id ? action.account : a)),
      };

    case 'account/remove':
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== action.id),
        // Keep the history, just detach it from the removed account.
        transactions: state.transactions.map((t) =>
          t.accountId === action.id ? { ...t, accountId: undefined } : t,
        ),
      };

    case 'txn/add':
      return { ...state, transactions: [action.txn, ...state.transactions] };

    case 'txn/addMany':
      return { ...state, transactions: [...action.txns, ...state.transactions] };

    case 'txn/update':
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.txn.id ? { ...action.txn, updatedAt: new Date().toISOString() } : t,
        ),
      };

    case 'txn/remove': {
      const removed = state.transactions.find((t) => t.id === action.id);
      if (!removed) return state;
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.id),
        recycleBin: [binEntry(state, 'transaction', { transaction: removed }), ...state.recycleBin],
      };
    }

    case 'pending/add':
      // Cross-referencing happens here rather than at the capture screens, so
      // that no route into the queue — paste, share target, OCR — can add a
      // duplicate the others would have caught.
      return action.items.reduce(absorbCapture, state);

    case 'pending/updateDraft':
      return {
        ...state,
        pending: state.pending.map((p) =>
          p.id === action.id ? { ...p, draft: { ...p.draft, ...action.draft } } : p,
        ),
      };

    case 'pending/approve': {
      const item = state.pending.find((p) => p.id === action.id);
      if (!item || item.status !== 'pending') return state;
      const draft = { ...item.draft, ...action.draft };
      // An item with no amount can never post — the reviewer must fill it in first.
      if (!draft.amount || draft.amount <= 0) return state;
      const txn = transactionFromDraft(item, draft);
      return {
        ...state,
        transactions: [txn, ...state.transactions],
        pending: state.pending.map((p) =>
          p.id === action.id
            ? { ...p, draft, status: 'approved', reviewedAt: new Date().toISOString(), postedTransactionId: txn.id }
            : p,
        ),
      };
    }

    case 'pending/approveMany': {
      const now = new Date().toISOString();
      const created: Transaction[] = [];
      const pending = state.pending.map((p) => {
        if (!action.ids.includes(p.id) || p.status !== 'pending' || !p.draft.amount || p.draft.amount <= 0) return p;
        const txn = transactionFromDraft(p, p.draft);
        created.push(txn);
        return { ...p, status: 'approved' as const, reviewedAt: now, postedTransactionId: txn.id };
      });
      if (!created.length) return state;
      return { ...state, transactions: [...created, ...state.transactions], pending };
    }

    case 'pending/reject':
      return {
        ...state,
        pending: state.pending.map((p) =>
          p.id === action.id
            ? { ...p, status: 'rejected', reviewedAt: new Date().toISOString(), rejectionReason: action.reason }
            : p,
        ),
      };

    case 'pending/remove': {
      const removed = state.pending.find((p) => p.id === action.id);
      if (!removed) return state;
      return {
        ...state,
        pending: state.pending.filter((p) => p.id !== action.id),
        recycleBin: [binEntry(state, 'pending', { pending: removed }), ...state.recycleBin],
      };
    }

    case 'pending/clearReviewed': {
      const cleared = state.pending.filter((p) => p.status !== 'pending');
      if (!cleared.length) return state;
      return {
        ...state,
        pending: state.pending.filter((p) => p.status === 'pending'),
        recycleBin: [...cleared.map((p) => binEntry(state, 'pending', { pending: p })), ...state.recycleBin],
      };
    }

    case 'recycle/restore': {
      const item = state.recycleBin.find((d) => d.id === action.id);
      if (!item) return state;
      const rest = state.recycleBin.filter((d) => d.id !== action.id);
      if (item.transaction) {
        // Guard against restoring something that was recreated in the meantime.
        const exists = state.transactions.some((t) => t.id === item.transaction!.id);
        return {
          ...state,
          transactions: exists ? state.transactions : [item.transaction, ...state.transactions],
          recycleBin: rest,
        };
      }
      if (item.pending) {
        const exists = state.pending.some((p) => p.id === item.pending!.id);
        return {
          ...state,
          pending: exists ? state.pending : [item.pending, ...state.pending],
          recycleBin: rest,
        };
      }
      return { ...state, recycleBin: rest };
    }

    case 'recycle/purge':
      return { ...state, recycleBin: state.recycleBin.filter((d) => d.id !== action.id) };

    case 'recycle/purgeExpired':
      return purgeExpired(state);

    case 'budget/upsert': {
      const exists = state.budgets.some(
        (b) => b.category === action.budget.category && b.period === action.budget.period && b.effectiveFrom === action.budget.effectiveFrom,
      );
      return {
        ...state,
        budgets: exists
          ? state.budgets.map((b) =>
              b.category === action.budget.category && b.period === action.budget.period && b.effectiveFrom === action.budget.effectiveFrom
                ? { ...action.budget, id: b.id }
                : b,
            )
          : [...state.budgets, action.budget],
      };
    }

    case 'budget/remove':
      return { ...state, budgets: state.budgets.filter((b) => b.id !== action.id) };

    case 'goal/add':
      return { ...state, goals: [...state.goals, action.goal] };

    case 'goal/update':
      return { ...state, goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)) };

    case 'goal/remove':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };

    case 'goal/contribute':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.id
            ? {
                ...g,
                contributions: [...g.contributions, action.contribution],
                currentAmount: round2(g.currentAmount + action.contribution.amount),
              }
            : g,
        ),
      };

    case 'recurring/upsert': {
      const exists = state.recurring.some((r) => r.id === action.rule.id);
      return {
        ...state,
        recurring: exists
          ? state.recurring.map((r) => (r.id === action.rule.id ? action.rule : r))
          : [...state.recurring, action.rule],
      };
    }

    case 'recurring/remove':
      return { ...state, recurring: state.recurring.filter((r) => r.id !== action.id) };

    case 'recurring/runDue': {
      // Due rules propose entries into the approval queue — never into the
      // ledger. Marking the month generated keeps it to once per rule.
      const generated = generateDue(state.recurring, action.today);
      if (!generated.length) return state;
      const byRule = new Map(generated.map((g) => [g.ruleId, g.month]));
      return {
        ...state,
        pending: [...generated.map((g) => g.item), ...state.pending],
        recurring: state.recurring.map((r) =>
          byRule.has(r.id) ? { ...r, lastGeneratedMonth: byRule.get(r.id) } : r,
        ),
      };
    }

    case 'category/add': {
      if (state.categories.some((c) => c.name.toLowerCase() === action.category.name.toLowerCase())) return state;
      return { ...state, categories: [...state.categories, { ...action.category, custom: true }] };
    }

    case 'category/addSubcategory':
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.name === action.category && !c.subcategories.includes(action.subcategory)
            ? { ...c, subcategories: [...c.subcategories, action.subcategory] }
            : c,
        ),
      };

    case 'category/remove':
      return { ...state, categories: state.categories.filter((c) => !(c.custom && c.name === action.name)) };

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    default:
      return state;
  }
}

/**
 * The exported reducer. Every action runs through the plain reducer first, then
 * the change is described into the audit log — so the history is a property of
 * the store rather than something each screen has to remember to write.
 */
export function reducer(state: AppState, action: Action): AppState {
  const next = baseReducer(state, action);
  if (next === state) return state;
  // Hydration and restore-from-backup replace the log wholesale; they are not
  // themselves events within it.
  if (action.type === 'hydrate') return next;

  const record = describeAction(action as unknown as { type: string }, state, next);
  if (!record) return next;
  return { ...next, audit: [record, ...next.audit].slice(0, AUDIT_LIMIT) };
}

/** Fills in anything a stored state is missing after an upgrade. */
export function migrate(raw: unknown): AppState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const stored = raw as Partial<AppState>;
  const knownNames = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
  const custom = (stored.categories ?? []).filter((c) => c.custom && !knownNames.has(c.name));
  return {
    ...base,
    ...stored,
    version: STATE_VERSION,
    categories: [...DEFAULT_CATEGORIES, ...custom],
    settings: { ...base.settings, ...(stored.settings ?? {}) },
    transactions: (stored.transactions ?? []).map((t) => ({ ...t, tags: t.tags ?? [], attachmentIds: t.attachmentIds ?? [] })),
    pending: (stored.pending ?? []).map((p) => ({ ...p, attachmentIds: p.attachmentIds ?? [] })),
    audit: stored.audit ?? [],
    recycleBin: stored.recycleBin ?? [],
  };
}

/** Builds a pending draft from an extraction, mapping the bank hint to an account. */
export function draftFromExtraction(
  extraction: PendingItem['extraction'],
  accounts: Account[],
): PendingDraft {
  const bank = extraction.bank.value;
  const last4 = extraction.last4.value;
  const match =
    accounts.find((a) => (last4 ? a.last4 === last4 : false)) ??
    accounts.find((a) => (bank ? a.bankName.toLowerCase().includes(bank.toLowerCase().split(' ')[0]) : false) &&
      (extraction.paymentMode.value === 'Credit Card' ? a.accountType === 'Credit Card' : a.accountType !== 'Credit Card'));

  return {
    kind: extraction.kind,
    date: extraction.date.value || todayISO(),
    amount: extraction.amount.value ?? 0,
    merchant: extraction.merchant.value,
    category: extraction.category.value,
    subcategory: extraction.subcategory?.value,
    paymentMode: extraction.paymentMode.value,
    accountId: match?.id,
    remarks: undefined,
    tags: [],
    location: extraction.location.value ?? undefined,
  };
}
