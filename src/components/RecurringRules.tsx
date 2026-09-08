import { useMemo, useState } from 'react';
import type { PaymentMode, RecurringRule, TxnKind } from '@/types';
import { PAYMENT_MODES } from '@/data/categories';
import { useStore } from '@/store/AppStore';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Badge, Button, Card, EmptyState, Modal, Segmented, Select, Toggle, cx } from '@/components/ui/Primitives';
import { IconPlus, IconTrash, IconBudget } from '@/components/Icons';
import { nextDue, recurringTotals } from '@/engine/recurring';
import { formatINR, todayISO, uid } from '@/lib/utils';

/**
 * Rent, EMIs, SIPs, subscriptions, salary — the entries you already know are
 * coming. When one falls due it proposes itself into the approval queue, so a
 * bill that came in higher than expected is still caught by eye.
 */
export function RecurringRules() {
  const { state, dispatch, toast } = useStore();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [adding, setAdding] = useState(false);

  const totals = useMemo(() => recurringTotals(state.recurring), [state.recurring]);
  const rules = useMemo(
    () => [...state.recurring].sort((a, b) => a.dayOfMonth - b.dayOfMonth),
    [state.recurring],
  );

  return (
    <Card
      title="Recurring entries"
      subtitle={
        rules.length
          ? `${formatINR(totals.expense, true)} out · ${formatINR(totals.income, true)} in, every month`
          : 'Set up the charges you already know are coming'
      }
      action={<Button variant="primary" onClick={() => setAdding(true)}><IconPlus width={16} height={16} /> New rule</Button>}
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-plane px-3 py-2.5">
        <IconBudget width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-xs leading-relaxed text-muted">
          When a rule falls due it goes to <strong className="text-ink">Pending Approval</strong>, never
          straight to your ledger — so you can correct the amount against the real bill before it counts.
        </p>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No recurring entries yet"
          detail="Add your rent, EMI, SIP or salary and the app will raise it for review each month."
        />
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.id} className={cx('rounded-xl border border-line bg-plane p-3', !rule.active && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{rule.label}</p>
                  <p className="text-[11px] text-muted">
                    {rule.category}
                    {rule.subcategory ? ` · ${rule.subcategory}` : ''} · {rule.paymentMode} · day {rule.dayOfMonth}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cx('text-sm font-bold tnum', rule.kind === 'income' ? 'text-good' : 'text-ink')}>
                    {rule.kind === 'income' ? '+' : '−'}{formatINR(rule.amount)}
                  </p>
                  <p className="text-[11px] text-muted">next {nextDue(rule)}</p>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge tone={rule.active ? 'good' : 'neutral'}>{rule.active ? 'Active' : 'Paused'}</Badge>
                {rule.lastGeneratedMonth && (
                  <span className="text-[11px] text-subtle">last raised {rule.lastGeneratedMonth}</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Toggle
                    checked={rule.active}
                    label={`${rule.active ? 'Pause' : 'Resume'} ${rule.label}`}
                    onChange={(v) => dispatch({ type: 'recurring/upsert', rule: { ...rule, active: v } })}
                  />
                  <Button variant="quiet" onClick={() => setEditing(rule)}>Edit</Button>
                  <button
                    type="button"
                    aria-label={`Delete ${rule.label}`}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete "${rule.label}"?`,
                        message: 'This rule will stop raising entries for review each month.',
                        reassurance: 'Transactions it already created are not affected.',
                        confirmLabel: 'Delete rule',
                      });
                      if (!ok) return;
                      dispatch({ type: 'recurring/remove', id: rule.id });
                      toast('Recurring rule removed', 'info');
                    }}
                    className="text-subtle hover:text-critical"
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(adding || editing) && (
        <RuleDialog
          rule={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={(r) => {
            dispatch({ type: 'recurring/upsert', rule: r });
            toast(editing ? 'Rule updated' : `"${r.label}" will be raised on day ${r.dayOfMonth}`);
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function RuleDialog({
  rule, onClose, onSave,
}: {
  rule: RecurringRule | null;
  onClose: () => void;
  onSave: (r: RecurringRule) => void;
}) {
  const { state } = useStore();
  const [kind, setKind] = useState<TxnKind>(rule?.kind ?? 'expense');
  const [label, setLabel] = useState(rule?.label ?? '');
  const [merchant, setMerchant] = useState(rule?.merchant ?? '');
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '');
  const [category, setCategory] = useState(rule?.category ?? 'Rent/Housing');
  const [subcategory, setSubcategory] = useState(rule?.subcategory ?? '');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(rule?.paymentMode ?? 'Net Banking');
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.dayOfMonth ?? 1));
  const [error, setError] = useState('');

  const categories = state.categories.filter((c) => c.kind === kind);
  const subcategories = categories.find((c) => c.name === category)?.subcategories ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? 'Edit recurring rule' : 'New recurring rule'}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const value = Number(amount);
              const day = Number(dayOfMonth);
              if (!label.trim()) return setError('Give the rule a name');
              if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount above zero');
              if (!Number.isFinite(day) || day < 1 || day > 31) return setError('Day must be between 1 and 31');
              onSave({
                id: rule?.id ?? uid('rec'),
                kind,
                label: label.trim(),
                merchant: merchant.trim() || label.trim(),
                amount: Math.round(value * 100) / 100,
                category,
                subcategory: subcategory || undefined,
                paymentMode,
                accountId: accountId || undefined,
                dayOfMonth: Math.round(day),
                active: rule?.active ?? true,
                lastGeneratedMonth: rule?.lastGeneratedMonth,
                createdAt: rule?.createdAt || new Date().toISOString(),
              });
            }}
          >
            {rule ? 'Save changes' : 'Create rule'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={kind}
          onChange={(k) => { setKind(k); setCategory(k === 'income' ? 'Salary' : 'Rent/Housing'); setSubcategory(''); }}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
        />

        <label className="block">
          <span className="label">Name</span>
          <input className="input" placeholder="e.g. House rent" value={label} onChange={(e) => { setLabel(e.target.value); setError(''); }} autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Expected amount (₹)</span>
            <input className="input tnum" type="number" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} />
          </label>
          <label className="block">
            <span className="label">Day of month</span>
            <input className="input tnum" type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => { setDayOfMonth(e.target.value); setError(''); }} />
          </label>
          <label className="block">
            <span className="label">{kind === 'income' ? 'Payer' : 'Payee'}</span>
            <input className="input" placeholder="e.g. Landlord" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Category</span>
            <Select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setSubcategory(''); }}
              options={categories.map((c) => ({ value: c.name, label: c.name }))}
            />
          </label>
          <label className="block">
            <span className="label">Subcategory</span>
            <input className="input" list="rec-sub" placeholder="Optional" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
            <datalist id="rec-sub">{subcategories.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className="block">
            <span className="label">Payment mode</span>
            <Select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
            />
          </label>
        </div>

        <label className="block">
          <span className="label">Account</span>
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={[
              { value: '', label: 'Not linked' },
              ...state.accounts.filter((a) => !a.archived).map((a) => ({
                value: a.id,
                label: `${a.cardName || a.accountName} · ${a.bankName} ····${a.last4}`,
              })),
            ]}
          />
        </label>

        {error && <p className="text-xs text-critical">{error}</p>}
        <p className="rounded-xl bg-plane px-3 py-2.5 text-xs leading-relaxed text-muted">
          From day {dayOfMonth || '1'} each month this is raised for your approval with the amount above.
          A day past the end of a short month lands on its last day. Today is {todayISO()}.
        </p>
      </div>
    </Modal>
  );
}
