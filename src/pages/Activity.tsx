import { useMemo, useState } from 'react';
import type { AuditAction, AuditEntry, DeletedItem } from '@/types';
import { useStore } from '@/store/AppStore';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Badge, Button, Card, EmptyState, Segmented, cx, type Tone } from '@/components/ui/Primitives';
import { IconAlert, IconCheck, IconInfo, IconTrash } from '@/components/Icons';
import { formatMoney } from '@/lib/utils';

/** How each kind of change should read at a glance. */
const ACTION_TONE: Partial<Record<AuditAction, Tone>> = {
  'txn.create': 'good', 'pending.approve': 'good', 'txn.restore': 'good', 'pending.restore': 'good',
  'txn.delete': 'critical', 'txn.purge': 'critical', 'pending.reject': 'warning',
  'pending.delete': 'warning', 'data.reset': 'critical', 'account.delete': 'warning',
  'budget.delete': 'warning', 'goal.delete': 'warning', 'category.remove': 'warning',
};

const ACTION_LABEL: Partial<Record<AuditAction, string>> = {
  'txn.create': 'Created', 'txn.update': 'Edited', 'txn.delete': 'Deleted', 'txn.restore': 'Restored',
  'txn.purge': 'Purged', 'pending.capture': 'Captured', 'pending.approve': 'Approved',
  'pending.reject': 'Rejected', 'pending.delete': 'Removed', 'pending.restore': 'Restored',
  'pending.edit': 'Edited', 'pending.clearReviewed': 'Cleared',
  'account.create': 'Account added', 'account.update': 'Account edited', 'account.delete': 'Account removed',
  'budget.set': 'Budget set', 'budget.delete': 'Budget removed',
  'goal.create': 'Goal created', 'goal.update': 'Goal edited', 'goal.delete': 'Goal deleted',
  'goal.contribute': 'Contribution', 'category.add': 'Category added', 'category.addSub': 'Subcategory added',
  'category.remove': 'Category removed', 'settings.update': 'Settings', 'data.import': 'Data replaced',
  'data.reset': 'Data erased', 'recycle.purgeExpired': 'Auto-purge',
};

type Tab = 'history' | 'bin';

export function Activity() {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>('history');
  const binCount = state.recycleBin.length;

  return (
    <div className="space-y-4">
      <Card
        title="Activity"
        subtitle="Everything that has changed, and everything you can still get back"
        action={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'history', label: `History${state.audit.length ? ` (${state.audit.length})` : ''}` },
              { value: 'bin', label: `Recycle bin${binCount ? ` (${binCount})` : ''}` },
            ]}
          />
        }
      >
        {tab === 'history' ? <History entries={state.audit} /> : <RecycleBin items={state.recycleBin} />}
      </Card>
    </div>
  );
}

function History({ entries }: { entries: AuditEntry[] }) {
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(60);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? entries.filter((e) => e.summary.toLowerCase().includes(q)) : entries;
  }, [entries, filter]);

  if (!entries.length) {
    return (
      <EmptyState
        icon={<IconInfo width={28} height={28} />}
        title="No history yet"
        detail="Every change you make — approving, editing, deleting — is recorded here from now on."
      />
    );
  }

  return (
    <div className="space-y-3">
      <input
        className="input"
        placeholder="Search the history"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {shown.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">Nothing matches "{filter}".</p>
      ) : (
        <ol className="space-y-2">
          {shown.slice(0, limit).map((e) => (
            <li key={e.id} className="rounded-xl border border-line bg-plane p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{ACTION_LABEL[e.action] ?? e.action}</Badge>
                <time className="text-[11px] tnum text-subtle" dateTime={e.at}>
                  {new Date(e.at).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </time>
                {e.recoverable && <span className="text-[11px] text-subtle">· recoverable</span>}
              </div>
              <p className="mt-1.5 text-sm leading-snug text-ink">{e.summary}</p>
              {e.changes && e.changes.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-line pt-2">
                  {e.changes.map((c, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
                      <span className="font-semibold text-muted">{c.field}</span>
                      <span className="tnum text-subtle line-through">{c.from}</span>
                      <span aria-hidden="true" className="text-subtle">→</span>
                      <span className="tnum font-semibold text-ink">{c.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {shown.length > limit && (
        <div className="flex justify-center">
          <Button variant="quiet" onClick={() => setLimit((l) => l + 100)}>
            Show older ({shown.length - limit} more)
          </Button>
        </div>
      )}
    </div>
  );
}

function RecycleBin({ items }: { items: DeletedItem[] }) {
  const { dispatch, state, toast } = useStore();
  const confirm = useConfirm();
  const retention = state.settings.retentionDays;

  if (!items.length) {
    return (
      <EmptyState
        icon={<IconTrash width={28} height={28} />}
        title="The recycle bin is empty"
        detail={`Anything you delete is held here for ${retention} days before it is removed for good.`}
      />
    );
  }

  const sorted = [...items].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-plane px-3 py-2.5 text-xs leading-relaxed text-muted">
        Deleted items stay here for <strong className="text-ink">{retention} days</strong>, then go
        automatically. Restoring puts a transaction straight back into your ledger.
      </p>

      <ul className="space-y-2">
        {sorted.map((item) => {
          const daysLeft = Math.max(
            0,
            Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000),
          );
          const t = item.transaction;
          const p = item.pending;
          return (
            <li key={item.id} className="rounded-xl border border-line bg-plane p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{item.kind === 'transaction' ? 'Transaction' : 'Captured item'}</Badge>
                <span className={cx('text-[11px] font-semibold', daysLeft <= 3 ? 'text-warning' : 'text-subtle')}>
                  {daysLeft === 0 ? 'Purging today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                </span>
              </div>

              <p className="mt-1.5 text-sm font-semibold text-ink">
                {t
                  ? `${t.kind === 'income' ? '+' : '−'}${formatMoney(t.amount)} · ${t.merchant}`
                  : p?.draft.amount
                    ? `${formatMoney(p.draft.amount)} · ${p.draft.merchant}`
                    : 'Captured item'}
              </p>
              <p className="text-[11px] text-muted">
                {t ? `${t.category} · ${t.date}` : p ? `${p.draft.category} · was ${p.status}` : ''}
                {' · deleted '}
                {new Date(item.deletedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    dispatch({ type: 'recycle/restore', id: item.id });
                    toast('Restored');
                  }}
                >
                  <IconCheck width={15} height={15} /> Restore
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete permanently?',
                      message: t
                        ? `${formatMoney(t.amount)} at ${t.merchant} will be gone for good.`
                        : 'This captured item will be gone for good.',
                      reassurance: 'This cannot be undone. It will not appear in the recycle bin again.',
                      confirmLabel: 'Delete for good',
                    });
                    if (!ok) return;
                    dispatch({ type: 'recycle/purge', id: item.id });
                    toast('Deleted permanently', 'info');
                  }}
                >
                  <IconTrash width={14} height={14} /> Delete for good
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line pt-3">
        <Button
          variant="danger"
          onClick={async () => {
            const ok = await confirm({
              title: 'Empty the recycle bin?',
              message: `All ${items.length} items will be deleted for good.`,
              reassurance: 'This cannot be undone.',
              confirmLabel: 'Empty the bin',
            });
            if (!ok) return;
            for (const item of items) dispatch({ type: 'recycle/purge', id: item.id });
            toast('Recycle bin emptied', 'info');
          }}
        >
          <IconAlert width={15} height={15} /> Empty the bin
        </Button>
      </div>
    </div>
  );
}
