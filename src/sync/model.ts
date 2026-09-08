import type {
  Account, AppState, AuditEntry, Budget, CategoryDef, DeletedItem, Goal, PendingItem,
  RecurringRule, Settings, Transaction,
} from '@/types';
import { emptyState } from '@/store/reducer';

/**
 * How the app state is shaped for the cloud, and how two devices' copies are
 * reconciled.
 *
 * State is split across four documents rather than one so that unrelated edits
 * on two devices do not clobber each other, and so no single document
 * approaches Firestore's 1 MiB limit. Everything here is pure — the Firebase
 * SDK is not involved — so the merge rules can be tested properly.
 */

export interface DocMeta {
  /** When this device last wrote the document. */
  updatedAt: string;
  /** Which device wrote it, so a device can recognise its own echo. */
  deviceId: string;
}

export interface CoreDoc extends DocMeta {
  version: number;
  accounts: Account[];
  budgets: Budget[];
  goals: Goal[];
  recurring: RecurringRule[];
  categories: CategoryDef[];
  settings: Settings;
}

export interface TransactionsDoc extends DocMeta {
  items: Transaction[];
}

export interface PendingDoc extends DocMeta {
  items: PendingItem[];
}

export interface ActivityDoc extends DocMeta {
  audit: AuditEntry[];
  recycleBin: DeletedItem[];
}

export interface SyncDocs {
  core: CoreDoc;
  transactions: TransactionsDoc;
  pending: PendingDoc;
  activity: ActivityDoc;
}

export type SyncDocName = keyof SyncDocs;
export const SYNC_DOCS: SyncDocName[] = ['core', 'transactions', 'pending', 'activity'];

/**
 * Only this many audit entries are mirrored to the cloud. The full log stays on
 * the device that made it; the cloud copy is what a second device needs to see.
 */
export const AUDIT_SYNC_LIMIT = 500;

/** Firestore's hard limit is 1 MiB; warn well before it. */
export const DOC_SIZE_WARN_BYTES = 700_000;

export function splitState(state: AppState, meta: DocMeta): SyncDocs {
  return {
    core: {
      ...meta,
      version: state.version,
      accounts: state.accounts,
      budgets: state.budgets,
      goals: state.goals,
      recurring: state.recurring,
      // Only the user's own categories travel; the built-in list ships with the app.
      categories: state.categories.filter((c) => c.custom),
      settings: state.settings,
    },
    transactions: { ...meta, items: state.transactions },
    pending: { ...meta, items: state.pending },
    activity: {
      ...meta,
      audit: state.audit.slice(0, AUDIT_SYNC_LIMIT),
      recycleBin: state.recycleBin,
    },
  };
}

/** Rebuilds app state from whatever documents came back. Missing ones fall back. */
export function mergeDocs(docs: Partial<SyncDocs>, fallback: AppState = emptyState()): AppState {
  const base = emptyState();
  const core = docs.core;
  return {
    version: core?.version ?? fallback.version,
    accounts: core?.accounts ?? fallback.accounts,
    budgets: core?.budgets ?? fallback.budgets,
    goals: core?.goals ?? fallback.goals,
    recurring: core?.recurring ?? fallback.recurring,
    categories: [...base.categories, ...(core?.categories ?? []).filter((c) => c.custom)],
    settings: { ...base.settings, ...(core?.settings ?? fallback.settings) },
    transactions: docs.transactions?.items ?? fallback.transactions,
    pending: docs.pending?.items ?? fallback.pending,
    audit: docs.activity?.audit ?? fallback.audit,
    recycleBin: docs.activity?.recycleBin ?? fallback.recycleBin,
  };
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/**
 * Union of two lists keyed by id, with `newer` deciding which copy of a
 * duplicate survives. Additions from both sides are kept — the common case is
 * two devices each recording different transactions while offline.
 */
function unionById<T extends { id: string }>(
  local: T[],
  remote: T[],
  newer: (a: T, b: T) => T,
): T[] {
  const out = byId(local);
  for (const item of remote) {
    const mine = out.get(item.id);
    out.set(item.id, mine ? newer(mine, item) : item);
  }
  return [...out.values()];
}

const laterOf = <T>(a: T, b: T, at: (x: T) => string) => (at(a) >= at(b) ? a : b);

export interface MergeResult {
  state: AppState;
  /** What the merge had to decide, for the sync status line. */
  notes: string[];
}

/**
 * Reconciles this device's state with the cloud copy.
 *
 * Records are merged by id rather than the whole document being overwritten, so
 * two devices that were both offline keep both sets of entries. Deletions
 * survive the merge because a deleted record sits in the recycle bin, which
 * acts as a tombstone — without that, deleting on the phone and syncing from
 * the laptop would quietly bring it back.
 */
export function mergeStates(local: AppState, remote: AppState): MergeResult {
  const notes: string[] = [];

  const transactions = unionById(local.transactions, remote.transactions, (a, b) =>
    laterOf(a, b, (t) => t.updatedAt),
  );
  const pending = unionById(local.pending, remote.pending, (a, b) =>
    laterOf(a, b, (p) => p.reviewedAt ?? p.receivedAt),
  );
  const recycleBin = unionById(local.recycleBin, remote.recycleBin, (a, b) =>
    laterOf(a, b, (d) => d.deletedAt),
  );
  const audit = unionById(local.audit, remote.audit, (a) => a)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 2000);

  // A record in either bin is deleted, whatever the other device still holds.
  const tombstoned = new Set(
    recycleBin.flatMap((d) => [d.transaction?.id, d.pending?.id].filter(Boolean) as string[]),
  );
  const liveTransactions = transactions.filter((t) => !tombstoned.has(t.id));
  const livePending = pending.filter((p) => !tombstoned.has(p.id));

  const revived = transactions.length - liveTransactions.length;
  if (revived > 0) notes.push(`${revived} deleted item${revived === 1 ? '' : 's'} stayed deleted`);

  const added = liveTransactions.length - local.transactions.length;
  if (added > 0) notes.push(`${added} transaction${added === 1 ? '' : 's'} arrived from another device`);

  // Rarely-changed settings and masters take the newer document wholesale.
  const coreFromRemote = remoteCoreIsNewer(local, remote);
  if (coreFromRemote) notes.push('accounts, budgets and settings updated from another device');

  const core = coreFromRemote ? remote : local;

  return {
    state: {
      version: Math.max(local.version, remote.version),
      accounts: core.accounts,
      budgets: core.budgets,
      goals: core.goals,
      recurring: core.recurring,
      categories: core.categories,
      settings: core.settings,
      transactions: liveTransactions.sort((a, b) => b.date.localeCompare(a.date)),
      pending: livePending,
      audit,
      recycleBin,
    },
    notes,
  };
}

/**
 * Whether the remote copy of the rarely-changed masters is the newer one.
 * Judged by the latest audit entry each side carries, since that is the app's
 * own record of when something last changed.
 */
function remoteCoreIsNewer(local: AppState, remote: AppState): boolean {
  const lastLocal = local.audit[0]?.at ?? '';
  const lastRemote = remote.audit[0]?.at ?? '';
  return lastRemote > lastLocal;
}

/** Rough serialized size, for the size guard. */
export function estimateBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

/** Documents at risk of hitting Firestore's per-document ceiling. */
export function oversizedDocs(docs: SyncDocs): Array<{ name: SyncDocName; bytes: number }> {
  return SYNC_DOCS.map((name) => ({ name, bytes: estimateBytes(docs[name]) })).filter(
    (d) => d.bytes > DOC_SIZE_WARN_BYTES,
  );
}

/** A stable per-browser id, so a device can recognise its own writes. */
export function deviceId(): string {
  const KEY = 'pfa.deviceId';
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'dev_ephemeral';
  }
}
