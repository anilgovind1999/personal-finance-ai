import { useMemo, useState } from 'react';
import type { PaymentMode, Transaction, TxnKind } from '@/types';
import { PAYMENT_MODES } from '@/data/categories';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, EmptyState, Modal, Select, cx } from '@/components/ui/Primitives';
import {
  TransactionForm, emptyForm, formFromTransaction, toTransaction, validate, type TxnFormValue,
} from '@/components/TransactionForm';
import { IconEdit, IconFilter, IconLedger, IconSearch, IconTrash, IconX } from '@/components/Icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { applyFilters, smartSearch, SEARCH_EXAMPLES, type SearchAnswer } from '@/engine/search';
import { rateFor } from '@/engine/currency';
import { track } from '@/sync/analytics';
import { expensesOf, incomeOf, totalOf } from '@/engine/analytics';
import { formatMoney, fromISODate, monthKey, todayISO } from '@/lib/utils';

interface Filters {
  from: string;
  to: string;
  kind: '' | TxnKind;
  category: string;
  paymentMode: '' | PaymentMode;
  accountId: string;
  text: string;
}

const EMPTY_FILTERS: Filters = { from: '', to: '', kind: '', category: '', paymentMode: '', accountId: '', text: '' };

export function Transactions({ initialEdit }: { initialEdit?: Transaction | null }) {
  const { state, dispatch, toast } = useStore();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(initialEdit ?? null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  const [limit, setLimit] = useState(50);

  const rows = useMemo(() => {
    const filtered = applyFilters(state.transactions, {
      from: filters.from || undefined,
      to: filters.to || undefined,
      kind: filters.kind || undefined,
      categories: filters.category ? [filters.category] : undefined,
      paymentModes: filters.paymentMode ? [filters.paymentMode] : undefined,
      text: filters.text || undefined,
      intent: 'list',
    }, state.accounts);
    const scoped = filters.accountId ? filtered.filter((t) => t.accountId === filters.accountId) : filtered;
    return [...scoped].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [state.transactions, state.accounts, filters]);

  const totals = useMemo(
    () => ({ expense: totalOf(expensesOf(rows)), income: totalOf(incomeOf(rows)) }),
    [rows],
  );

  const activeFilterCount = Object.entries(filters).filter(([, v]) => v).length;

  const ask = (q: string) => {
    if (!q.trim()) return;
    setAnswer(smartSearch(q, state.transactions, state.accounts, todayISO(), state.categories.filter((c) => c.custom).map((c) => c.name)));
  };

  return (
    <div className="space-y-4">
      <Card title="Ask about your money" subtitle="Plain-English search across every approved transaction" dense>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              className="input pl-9"
              placeholder="How much did I spend on food last month?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask(question)}
            />
          </div>
          <Button variant="primary" onClick={() => ask(question)}>Ask</Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {SEARCH_EXAMPLES.slice(0, 5).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { setQuestion(e); ask(e); }}
              className="rounded-pill border border-line bg-raised px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {e}
            </button>
          ))}
        </div>

        {answer && (
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/8 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold tnum text-ink">{answer.headline}</p>
                <p className="mt-0.5 text-xs text-muted">{answer.detail}</p>
              </div>
              <button type="button" onClick={() => setAnswer(null)} aria-label="Dismiss answer" className="shrink-0 text-subtle hover:text-ink">
                <IconX width={16} height={16} />
              </button>
            </div>
            {answer.slices.length > 0 && (
              <ul className="mt-2.5 space-y-1 border-t border-accent/20 pt-2.5">
                {answer.slices.slice(0, 6).map((s) => (
                  <li key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="truncate text-muted">{s.name}</span>
                    <span className="ml-auto shrink-0 font-semibold tnum text-ink">{formatMoney(s.value)}</span>
                    <span className="w-9 shrink-0 text-right tnum text-subtle">{s.share}%</span>
                  </li>
                ))}
              </ul>
            )}
            {!answer.understood && (
              <p className="mt-2 text-[11px] text-warning">
                That question was hard to read — try naming a category and a period, e.g. "fuel spend last month".
              </p>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Transaction ledger"
        subtitle={`${rows.length} entries · ${formatMoney(totals.expense, true)} out · ${formatMoney(totals.income, true)} in`}
        action={
          <Button variant={activeFilterCount ? 'primary' : 'ghost'} onClick={() => setShowFilters((s) => !s)}>
            <IconFilter width={15} height={15} />
            {activeFilterCount ? `Filters (${activeFilterCount})` : 'Filters'}
          </Button>
        }
        dense
      >
        {showFilters && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-line bg-plane p-3 sm:grid-cols-3 lg:grid-cols-4">
            <label className="block">
              <span className="label">From</span>
              <input type="date" className="input tnum" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">To</span>
              <input type="date" className="input tnum" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Type</span>
              <Select
                value={filters.kind}
                onChange={(e) => setFilters({ ...filters, kind: e.target.value as Filters['kind'] })}
                options={[{ value: '', label: 'All' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
              />
            </label>
            <label className="block">
              <span className="label">Category</span>
              <Select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                options={[{ value: '', label: 'All' }, ...state.categories.map((c) => ({ value: c.name, label: c.name }))]}
              />
            </label>
            <label className="block">
              <span className="label">Payment mode</span>
              <Select
                value={filters.paymentMode}
                onChange={(e) => setFilters({ ...filters, paymentMode: e.target.value as Filters['paymentMode'] })}
                options={[{ value: '', label: 'All' }, ...PAYMENT_MODES.map((m) => ({ value: m, label: m }))]}
              />
            </label>
            <label className="block">
              <span className="label">Account</span>
              <Select
                value={filters.accountId}
                onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
                options={[
                  { value: '', label: 'All' },
                  ...state.accounts.map((a) => ({ value: a.id, label: `${a.cardName || a.accountName} ····${a.last4}` })),
                ]}
              />
            </label>
            <label className="col-span-2 block">
              <span className="label">Search text</span>
              <input className="input" placeholder="Merchant, remark or tag" value={filters.text} onChange={(e) => setFilters({ ...filters, text: e.target.value })} />
            </label>
            <div className="col-span-2 flex items-end sm:col-span-1">
              <Button variant="quiet" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all</Button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={<IconLedger width={30} height={30} />}
            title="No transactions match"
            detail={activeFilterCount ? 'Try widening the filters.' : 'Approved transactions appear here.'}
          />
        ) : (
          <>
            <TransactionList rows={rows.slice(0, limit)} onEdit={setEditing} />
            {rows.length > limit && (
              <div className="mt-3 flex justify-center">
                <Button variant="quiet" onClick={() => setLimit((l) => l + 100)}>
                  Show more ({rows.length - limit} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {editing && (
        <EditTransaction
          txn={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            dispatch({ type: 'txn/update', txn: t });
            toast('Transaction updated');
            setEditing(null);
          }}
          onDelete={async () => {
            const ok = await confirm({
              title: 'Delete this transaction?',
              message: (
                <>
                  <strong>{formatMoney(editing.amount)} at {editing.merchant}</strong> will be removed from
                  your ledger, and from every dashboard, budget and report that counts it.
                </>
              ),
              reassurance: `It goes to the recycle bin and can be restored for ${state.settings.retentionDays} days.`,
              confirmLabel: 'Delete',
            });
            if (!ok) return;
            dispatch({ type: 'txn/remove', id: editing.id });
            toast('Moved to the recycle bin', 'info');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Date-grouped list — the mobile-first reading of a ledger. */
export function TransactionList({
  rows, onEdit, compact,
}: {
  rows: Transaction[];
  onEdit?: (t: Transaction) => void;
  compact?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of rows) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="space-y-4">
      {groups.map(([date, items]) => {
        const dayTotal = totalOf(expensesOf(items));
        return (
          <div key={date}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-subtle">{formatDateHeading(date)}</span>
              {dayTotal > 0 && <span className="text-[11px] font-semibold tnum text-subtle">−{formatMoney(dayTotal, true)}</span>}
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised">
              {items.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={!onEdit}
                    onClick={() => onEdit?.(t)}
                    className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors', onEdit && 'hover:bg-plane')}
                  >
                    <span
                      className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold',
                        t.kind === 'income' ? 'bg-good/12 text-good' : 'bg-accent/10 text-accent')}
                      aria-hidden="true"
                    >
                      {t.category.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{t.merchant}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {t.category}
                        {t.subcategory ? ` · ${t.subcategory}` : ''} · {t.paymentMode}
                        {t.source !== 'manual' && ' · AI captured'}
                        {t.original && ` · ${t.original.currency} ${t.original.amount}`}
                      </span>
                      {!compact && t.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {t.tags.map((tag) => (
                            <span key={tag} className="rounded-pill bg-plane px-1.5 py-0.5 text-[10px] text-subtle">#{tag}</span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className={cx('shrink-0 text-sm font-bold tnum', t.kind === 'income' ? 'text-good' : 'text-ink')}>
                      {t.kind === 'income' ? '+' : '−'}{formatMoney(t.amount)}
                    </span>
                    {onEdit && <IconEdit width={14} height={14} className="shrink-0 text-subtle" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function formatDateHeading(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  const d = fromISODate(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function EditTransaction({
  txn, onClose, onSave, onDelete,
}: {
  txn: Transaction;
  onClose: () => void;
  onSave: (t: Transaction) => void;
  onDelete: () => void | Promise<void>;
}) {
  const { state } = useStore();
  const [form, setForm] = useState<TxnFormValue>(() => formFromTransaction(txn, state.settings.currency));
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit transaction"
      wide
      footer={
        <>
          <Button variant="danger" onClick={() => void onDelete()} className="mr-auto">
            <IconTrash width={15} height={15} /> Delete
          </Button>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const home = state.settings.currency;
              const known = rateFor(form.currency, home, state.settings.rateTable);
              const found = validate(form, home, known);
              setErrors(found);
              if (!Object.keys(found).length) {
                onSave(toTransaction(form, txn, home, state.settings.rateTable));
              }
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      {txn.source !== 'manual' && (
        <p className="mb-3">
          <Badge tone="accent">Captured by AI from {txn.source} · approved on {monthKey(txn.createdAt.slice(0, 10))}</Badge>
        </p>
      )}
      <TransactionForm value={form} onChange={setForm} errors={errors} />
    </Modal>
  );
}

/** The quick-add sheet reachable from the floating button on every screen. */
export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, toast } = useStore();
  const home = state.settings.currency;
  const [form, setForm] = useState<TxnFormValue>(() => emptyForm('expense', home));
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});

  if (!open) return null;

  const submit = (keepOpen: boolean) => {
    const known = rateFor(form.currency, home, state.settings.rateTable);
    const found = validate(form, home, known);
    setErrors(found);
    if (Object.keys(found).length) return;
    const txn = toTransaction(form, undefined, home, state.settings.rateTable);
    dispatch({ type: 'txn/add', txn });
    void track('transaction_recorded', { feature: 'manual_entry' });
    toast(`${formatMoney(txn.amount)} recorded`);
    if (keepOpen) {
      setForm({ ...emptyForm(form.kind, home), date: form.date, accountId: form.accountId, currency: form.currency });
    } else onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add transaction"
      wide
      footer={
        <>
          <Button variant="quiet" onClick={() => submit(true)}>Save &amp; add another</Button>
          <Button variant="primary" onClick={() => submit(false)}>Save</Button>
        </>
      }
    >
      <TransactionForm value={form} onChange={setForm} errors={errors} />
    </Modal>
  );
}
