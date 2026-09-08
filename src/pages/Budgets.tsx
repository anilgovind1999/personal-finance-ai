import { useMemo, useState } from 'react';
import type { Budget, BudgetPeriod } from '@/types';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, EmptyState, Modal, Progress, Segmented, Select, cx } from '@/components/ui/Primitives';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { IconAlert, IconBudget, IconPlus, IconTrash } from '@/components/Icons';
import { budgetAlerts, evaluateAll } from '@/engine/budget';
import { byCategory } from '@/engine/analytics';
import { formatINR, monthKey, todayISO, uid } from '@/lib/utils';

export function Budgets() {
  const { state, dispatch, toast } = useStore();
  const confirm = useConfirm();
  const today = todayISO();
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [adding, setAdding] = useState(false);

  const statuses = useMemo(
    () => evaluateAll(state.budgets, state.transactions, today, state.settings.alertThresholds).filter((s) => s.budget.period === period),
    [state.budgets, state.transactions, today, state.settings.alertThresholds, period],
  );
  const alerts = useMemo(() => budgetAlerts(statuses), [statuses]);
  const overall = statuses.find((s) => s.budget.category === 'ALL');
  const categoryStatuses = statuses.filter((s) => s.budget.category !== 'ALL');

  /** Categories with spend but no budget — the obvious next thing to set. */
  const unbudgeted = useMemo(() => {
    const budgeted = new Set(state.budgets.filter((b) => b.period === period).map((b) => b.category));
    return byCategory(state.transactions.filter((t) => monthKey(t.date) === monthKey(today)))
      .filter((c) => !budgeted.has(c.name))
      .slice(0, 5);
  }, [state.budgets, state.transactions, period, today]);

  return (
    <div className="space-y-4">
      <Card
        title="Budget management"
        subtitle="Alerts fire at 80%, 90% and 100% of each limit"
        action={
          <div className="flex gap-2">
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'annual', label: 'Annual' },
              ]}
            />
          </div>
        }
      >
        <Button variant="primary" onClick={() => setAdding(true)} className="mb-4">
          <IconPlus width={16} height={16} /> Set a budget
        </Button>

        {alerts.length > 0 && (
          <ul className="mb-4 space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={cx('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs',
                  a.severity === 'exceeded' ? 'border-critical/35 bg-critical/10'
                    : a.severity === 'critical' ? 'border-serious/35 bg-serious/10'
                    : 'border-warning/35 bg-warning/10')}
              >
                <IconAlert
                  width={15} height={15}
                  className={cx('mt-0.5 shrink-0', a.severity === 'exceeded' ? 'text-critical' : a.severity === 'critical' ? 'text-serious' : 'text-warning')}
                />
                <span className="text-ink">{a.message}</span>
              </li>
            ))}
          </ul>
        )}

        {overall && (
          <div className="mb-4 rounded-card border border-line bg-plane p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-subtle">Overall {period} budget</p>
                <p className="mt-1 text-xl font-bold tnum">
                  {formatINR(overall.spent, true)}
                  <span className="text-sm font-medium text-muted"> of {formatINR(overall.allocated, true)}</span>
                </p>
              </div>
              <div className="text-right">
                <p className={cx('text-lg font-bold tnum', overall.remaining < 0 ? 'text-critical' : 'text-good')}>
                  {overall.remaining < 0 ? `${formatINR(Math.abs(overall.remaining), true)} over` : `${formatINR(overall.remaining, true)} left`}
                </p>
                <p className="text-[11px] text-muted">{overall.daysTotal - overall.daysElapsed} days remaining</p>
              </div>
            </div>
            <Progress value={overall.utilisation} tone={toneFor(overall.utilisation)} />
            <p className="mt-2 text-xs text-muted">
              {overall.utilisation}% used · projected finish {formatINR(overall.projected, true)}
              {overall.projectedOverrun > 0 && <span className="font-semibold text-warning"> ({formatINR(overall.projectedOverrun, true)} over)</span>}
            </p>
          </div>
        )}

        {categoryStatuses.length ? (
          <ul className="space-y-3">
            {categoryStatuses.map((s) => (
              <li key={s.budget.id} className="rounded-xl border border-line bg-raised p-3">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{s.budget.category}</span>
                  <span className="text-xs font-semibold tnum text-muted">
                    {formatINR(s.spent, true)} / {formatINR(s.allocated, true)}
                  </span>
                </div>
                <Progress value={s.utilisation} tone={toneFor(s.utilisation)} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={toneFor(s.utilisation)}>{s.utilisation}% used</Badge>
                  <span className="text-[11px] text-muted">
                    {s.remaining >= 0 ? `${formatINR(s.remaining, true)} remaining` : `${formatINR(Math.abs(s.remaining), true)} over`}
                    {' · projected '}{formatINR(s.projected, true)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${s.budget.category} budget`}
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Remove this budget?',
                        message: (
                          <>
                            The {formatINR(s.allocated)} {s.budget.period} budget for{' '}
                            <strong>{s.budget.category}</strong> will no longer be tracked or alert you.
                          </>
                        ),
                        reassurance: 'Your transactions are not affected.',
                        confirmLabel: 'Remove budget',
                      });
                      if (!ok) return;
                      dispatch({ type: 'budget/remove', id: s.budget.id });
                      toast('Budget removed', 'info');
                    }}
                    className="ml-auto text-subtle hover:text-critical"
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<IconBudget width={30} height={30} />}
            title={`No ${period} category budgets yet`}
            detail="Set limits per category and the app will warn you before you overshoot."
          />
        )}

        {unbudgeted.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">Spending without a budget</p>
            <ul className="flex flex-wrap gap-1.5">
              {unbudgeted.map((c) => (
                <li key={c.name}>
                  <span className="chip">
                    {c.name}
                    <span className="tnum text-ink">{formatINR(c.value, true)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {adding && (
        <BudgetDialog
          period={period}
          existing={state.budgets}
          categories={state.categories.filter((c) => c.kind === 'expense').map((c) => c.name)}
          onClose={() => setAdding(false)}
          onSave={(b) => {
            dispatch({ type: 'budget/upsert', budget: b });
            toast(`${b.category === 'ALL' ? 'Overall' : b.category} budget set to ${formatINR(b.amount, true)}`);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function toneFor(u: number) {
  if (u >= 100) return 'critical' as const;
  if (u >= 90) return 'serious' as const;
  if (u >= 80) return 'warning' as const;
  return 'good' as const;
}

function BudgetDialog({
  period, categories, existing, onClose, onSave,
}: {
  period: BudgetPeriod;
  categories: string[];
  existing: Budget[];
  onClose: () => void;
  onSave: (b: Budget) => void;
}) {
  const thisMonth = monthKey(todayISO());
  const [category, setCategory] = useState('ALL');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const current = existing.find((b) => b.category === category && b.period === period && b.effectiveFrom <= thisMonth);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Set a ${period} budget`}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const value = Number(amount);
              if (!Number.isFinite(value) || value <= 0) {
                setError('Enter an amount above zero');
                return;
              }
              onSave({
                id: uid('bud'), category, period, amount: Math.round(value * 100) / 100,
                effectiveFrom: thisMonth, createdAt: new Date().toISOString(),
              });
            }}
          >
            Save budget
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Applies to</span>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ value: 'ALL', label: `Overall ${period} budget` }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        </label>

        <label className="block">
          <span className="label">Limit (₹)</span>
          <input
            className="input text-lg font-semibold tnum"
            type="number"
            min="0"
            step="100"
            inputMode="decimal"
            placeholder={current ? String(current.amount) : '0'}
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); }}
            autoFocus
          />
          {error && <span className="mt-1 block text-xs text-critical">{error}</span>}
          {current && <span className="mt-1 block text-xs text-muted">Currently {formatINR(current.amount)} — saving replaces it from {thisMonth}.</span>}
        </label>

        <p className="rounded-xl bg-plane px-3 py-2.5 text-xs leading-relaxed text-muted">
          Budgets track approved transactions only. You will be alerted at 80%, 90% and 100% of the limit,
          and earlier if the pace suggests an overrun.
        </p>
      </div>
    </Modal>
  );
}
