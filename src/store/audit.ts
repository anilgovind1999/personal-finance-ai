import type { Account, AppState, AuditEntry, Budget, Goal, Transaction } from '@/types';
import { formatINR, uid } from '@/lib/utils';

/**
 * Derives the audit entry for an action by comparing the state before and after.
 *
 * Doing it here — once, centrally — rather than inside each reducer case means a
 * new action cannot quietly slip through unrecorded: if it changes the state and
 * is not described here, that is visible as a gap rather than a silent hole in
 * the history.
 */

function entry(
  action: AuditEntry['action'],
  summary: string,
  extra: Partial<AuditEntry> = {},
): AuditEntry {
  return { id: uid('aud'), at: new Date().toISOString(), action, summary, ...extra };
}

function describeTxn(t: Transaction): string {
  const sign = t.kind === 'income' ? '+' : '−';
  return `${sign}${formatINR(t.amount)} · ${t.merchant} · ${t.category} · ${t.date}`;
}

function accountLabel(a: Account): string {
  return `${a.cardName || a.accountName} ····${a.last4}`;
}

/** Field-level diff between two transactions, for the edit history. */
export function diffTransaction(before: Transaction, after: Transaction): AuditEntry['changes'] {
  const fields: Array<[string, unknown, unknown]> = [
    ['Amount', before.amount, after.amount],
    ['Date', before.date, after.date],
    ['Merchant', before.merchant, after.merchant],
    ['Category', before.category, after.category],
    ['Subcategory', before.subcategory ?? '—', after.subcategory ?? '—'],
    ['Payment mode', before.paymentMode, after.paymentMode],
    ['Account', before.accountId ?? '—', after.accountId ?? '—'],
    ['Remarks', before.remarks ?? '—', after.remarks ?? '—'],
    ['Tags', before.tags.join(' ') || '—', after.tags.join(' ') || '—'],
    ['Type', before.kind, after.kind],
  ];
  return fields
    .filter(([, from, to]) => String(from) !== String(to))
    .map(([field, from, to]) => ({ field: String(field), from: String(from), to: String(to) }));
}

type AnyAction = { type: string } & Record<string, unknown>;

export function describeAction(action: AnyAction, before: AppState, after: AppState): AuditEntry | null {
  switch (action.type) {
    case 'txn/add': {
      const t = action.txn as Transaction;
      return entry('txn.create', `Added ${describeTxn(t)}`, { entityId: t.id, amount: t.amount });
    }

    case 'txn/addMany': {
      const list = action.txns as Transaction[];
      return entry('txn.create', `Imported ${list.length} transactions`, {
        amount: list.reduce((a, t) => a + t.amount, 0),
      });
    }

    case 'txn/update': {
      const next = action.txn as Transaction;
      const prev = before.transactions.find((t) => t.id === next.id);
      if (!prev) return null;
      const changes = diffTransaction(prev, next);
      if (!changes?.length) return null;
      return entry('txn.update', `Edited ${describeTxn(next)}`, {
        entityId: next.id,
        changes,
        amount: next.amount,
      });
    }

    case 'txn/remove': {
      const t = before.transactions.find((x) => x.id === action.id);
      if (!t) return null;
      return entry('txn.delete', `Deleted ${describeTxn(t)}`, {
        entityId: t.id,
        amount: t.amount,
        recoverable: true,
      });
    }

    case 'recycle/restore': {
      const item = before.recycleBin.find((d) => d.id === action.id);
      if (!item) return null;
      if (item.transaction) {
        return entry('txn.restore', `Restored ${describeTxn(item.transaction)}`, {
          entityId: item.transaction.id,
          amount: item.transaction.amount,
        });
      }
      return entry('pending.restore', `Restored a captured item from the recycle bin`, { entityId: item.id });
    }

    case 'recycle/purge': {
      const item = before.recycleBin.find((d) => d.id === action.id);
      if (!item) return null;
      const what = item.transaction ? describeTxn(item.transaction) : 'a captured item';
      return entry('txn.purge', `Permanently deleted ${what}`, { entityId: item.id });
    }

    case 'recycle/purgeExpired': {
      const removed = before.recycleBin.length - after.recycleBin.length;
      if (removed <= 0) return null;
      return entry('recycle.purgeExpired', `${removed} item${removed === 1 ? '' : 's'} passed the retention window and were purged`);
    }

    case 'pending/add': {
      const items = action.items as AppState['pending'];
      const one = items[0];
      return entry(
        'pending.capture',
        items.length === 1 && one
          ? `Captured from ${one.source}: ${one.draft.amount ? formatINR(one.draft.amount) : 'no amount'} · ${one.draft.merchant}`
          : `Captured ${items.length} items for review`,
        { entityId: one?.id },
      );
    }

    case 'pending/approve': {
      const posted = after.transactions.find(
        (t) => !before.transactions.some((b) => b.id === t.id),
      );
      if (!posted) return null;
      const item = before.pending.find((p) => p.id === action.id);
      const edited = item ? diffDraft(item, posted) : [];
      return entry('pending.approve', `Approved and posted ${describeTxn(posted)}`, {
        entityId: posted.id,
        amount: posted.amount,
        changes: edited.length ? edited : undefined,
      });
    }

    case 'pending/approveMany': {
      const created = after.transactions.length - before.transactions.length;
      if (created <= 0) return null;
      return entry('pending.approve', `Approved ${created} captured transaction${created === 1 ? '' : 's'} in bulk`);
    }

    case 'pending/reject': {
      const item = before.pending.find((p) => p.id === action.id);
      if (!item) return null;
      const amount = item.draft.amount ? formatINR(item.draft.amount) : 'no amount';
      return entry('pending.reject', `Rejected ${amount} · ${item.draft.merchant} — nothing was posted`, {
        entityId: item.id,
        amount: item.draft.amount,
        recoverable: true,
      });
    }

    case 'pending/updateDraft': {
      const item = before.pending.find((p) => p.id === action.id);
      if (!item) return null;
      return entry('pending.edit', `Edited a captured item before review`, { entityId: item.id });
    }

    case 'pending/remove': {
      const item = before.pending.find((p) => p.id === action.id);
      if (!item) return null;
      return entry('pending.delete', `Removed a ${item.status} capture from history`, {
        entityId: item.id,
        recoverable: true,
      });
    }

    case 'pending/clearReviewed': {
      const removed = before.pending.length - after.pending.length;
      if (removed <= 0) return null;
      return entry('pending.clearReviewed', `Cleared ${removed} reviewed capture${removed === 1 ? '' : 's'} from history`);
    }

    case 'account/add':
      return entry('account.create', `Added account ${accountLabel(action.account as Account)}`, {
        entityId: (action.account as Account).id,
      });

    case 'account/update':
      return entry('account.update', `Updated account ${accountLabel(action.account as Account)}`, {
        entityId: (action.account as Account).id,
      });

    case 'account/remove': {
      const a = before.accounts.find((x) => x.id === action.id);
      if (!a) return null;
      return entry('account.delete', `Removed account ${accountLabel(a)} — its transactions were kept`, {
        entityId: a.id,
      });
    }

    case 'budget/upsert': {
      const b = action.budget as Budget;
      const label = b.category === 'ALL' ? `overall ${b.period}` : `${b.category} ${b.period}`;
      return entry('budget.set', `Set ${label} budget to ${formatINR(b.amount)}`, { entityId: b.id, amount: b.amount });
    }

    case 'budget/remove': {
      const b = before.budgets.find((x) => x.id === action.id);
      if (!b) return null;
      const label = b.category === 'ALL' ? `overall ${b.period}` : `${b.category} ${b.period}`;
      return entry('budget.delete', `Removed the ${label} budget`, { entityId: b.id });
    }

    case 'goal/add':
      return entry('goal.create', `Created goal "${(action.goal as Goal).name}"`, {
        entityId: (action.goal as Goal).id,
        amount: (action.goal as Goal).targetAmount,
      });

    case 'goal/update':
      return entry('goal.update', `Updated goal "${(action.goal as Goal).name}"`, { entityId: (action.goal as Goal).id });

    case 'goal/remove': {
      const g = before.goals.find((x) => x.id === action.id);
      return g ? entry('goal.delete', `Deleted goal "${g.name}"`, { entityId: g.id }) : null;
    }

    case 'goal/contribute': {
      const g = before.goals.find((x) => x.id === action.id);
      const c = action.contribution as Goal['contributions'][number];
      if (!g) return null;
      return entry('goal.contribute', `Added ${formatINR(c.amount)} to "${g.name}"`, {
        entityId: g.id,
        amount: c.amount,
      });
    }

    case 'recurring/upsert':
      return entry('recurring.set', `Saved a recurring rule`, { entityId: String(action.id ?? '') });

    case 'recurring/remove':
      return entry('recurring.delete', `Removed a recurring rule`, { entityId: String(action.id ?? '') });

    case 'category/add':
      return entry('category.add', `Added custom category "${(action.category as { name: string }).name}"`);

    case 'category/addSubcategory':
      return entry('category.addSub', `Added subcategory "${action.subcategory}" to ${action.category}`);

    case 'category/remove':
      return entry('category.remove', `Removed custom category "${action.name}"`);

    case 'settings/update': {
      const keys = Object.keys(action.settings as object);
      // Flipping the theme is not history worth keeping.
      const meaningful = keys.filter((k) => k !== 'theme');
      if (!meaningful.length) return null;
      return entry('settings.update', `Changed settings: ${meaningful.join(', ')}`);
    }

    case 'replaceAll':
      return entry('data.import', `Replaced all data — ${after.transactions.length} transactions loaded`);

    case 'reset':
      return entry('data.reset', `Erased all data`);

    default:
      return null;
  }
}

/** What the reviewer changed between the AI's proposal and what was posted. */
function diffDraft(item: AppState['pending'][number], posted: Transaction): NonNullable<AuditEntry['changes']> {
  const e = item.extraction;
  const pairs: Array<[string, unknown, unknown]> = [
    ['Amount', e.amount.value ?? '—', posted.amount],
    ['Date', e.date.value, posted.date],
    ['Merchant', e.merchant.value, posted.merchant],
    ['Category', e.category.value, posted.category],
    ['Payment mode', e.paymentMode.value, posted.paymentMode],
  ];
  return pairs
    .filter(([, from, to]) => String(from) !== String(to))
    .map(([field, from, to]) => ({ field: `AI read ${String(field).toLowerCase()}`, from: String(from), to: String(to) }));
}
