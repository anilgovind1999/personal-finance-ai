import { useMemo, useState } from 'react';
import type { Goal } from '@/types';
import { GOAL_TYPES } from '@/data/categories';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, EmptyState, Modal, Progress, Select, cx } from '@/components/ui/Primitives';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { IconPlus, IconTarget, IconTrash } from '@/components/Icons';
import { projectGoal } from '@/engine/forecast';
import { monthRange, summarise } from '@/engine/analytics';
import { formatINR, monthKey, todayISO, uid } from '@/lib/utils';

export function Goals() {
  const { state, dispatch, toast } = useStore();
  const confirm = useConfirm();
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [contributing, setContributing] = useState<Goal | null>(null);

  const monthlySavings = useMemo(
    () => summarise(state.transactions, monthRange(monthKey(today))).net,
    [state.transactions, today],
  );

  const projections = useMemo(
    () => state.goals.map((g) => projectGoal(g, monthlySavings, today)),
    [state.goals, monthlySavings, today],
  );

  const totals = projections.reduce(
    (acc, p) => ({ target: acc.target + p.goal.targetAmount, saved: acc.saved + p.goal.currentAmount }),
    { target: 0, saved: 0 },
  );

  return (
    <div className="space-y-4">
      <Card
        title="Savings goals"
        subtitle={
          state.goals.length
            ? `${formatINR(totals.saved, true)} of ${formatINR(totals.target, true)} funded`
            : 'Name what you are saving for and track it'
        }
        action={<Button variant="primary" onClick={() => setAdding(true)}><IconPlus width={16} height={16} /> New goal</Button>}
      >
        {projections.length === 0 ? (
          <EmptyState
            icon={<IconTarget width={30} height={30} />}
            title="No goals yet"
            detail="Emergency fund, a new vehicle, a holiday — set a target and the app projects when you will get there."
          />
        ) : (
          <ul className="space-y-3">
            {projections.map((p) => (
              <li key={p.goal.id} className="rounded-card border border-line bg-plane p-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{p.goal.name}</p>
                    <p className="text-[11px] text-muted">{p.goal.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tnum">{formatINR(p.goal.currentAmount, true)}</p>
                    <p className="text-[11px] text-muted">of {formatINR(p.goal.targetAmount, true)}</p>
                  </div>
                </div>

                <Progress value={p.progress} tone={p.progress >= 100 ? 'good' : p.onTrack === false ? 'warning' : 'accent'} />

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Badge tone={p.progress >= 100 ? 'good' : 'accent'}>{p.progress}% funded</Badge>
                  {p.remaining > 0 && <span className="text-[11px] text-muted">{formatINR(p.remaining, true)} to go</span>}
                  {p.expectedCompletion && p.remaining > 0 && (
                    <Badge tone={p.onTrack === false ? 'warning' : 'neutral'}>
                      Expected {new Date(p.expectedCompletion).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    </Badge>
                  )}
                  {p.goal.targetDate && (
                    <span className={cx('text-[11px]', p.onTrack === false ? 'text-warning' : 'text-muted')}>
                      Target {p.goal.targetDate}{p.onTrack === false ? ' · behind schedule' : ''}
                    </span>
                  )}
                </div>

                {p.monthlyRate > 0 && p.remaining > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted">
                    At {formatINR(p.monthlyRate, true)} a month, {p.monthsToGo} more month{p.monthsToGo === 1 ? '' : 's'}.
                  </p>
                )}
                {p.goal.note && <p className="mt-1.5 text-[11px] italic text-subtle">{p.goal.note}</p>}

                <div className="mt-3 flex gap-2">
                  <Button onClick={() => setContributing(p.goal)}>Add contribution</Button>
                  <Button
                    variant="quiet"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete "${p.goal.name}"?`,
                        message: (
                          <>
                            The goal and its {p.goal.contributions.length} recorded contribution
                            {p.goal.contributions.length === 1 ? '' : 's'} will be deleted.
                          </>
                        ),
                        reassurance: 'Your transactions are not affected. This cannot be undone.',
                        confirmLabel: 'Delete goal',
                      });
                      if (!ok) return;
                      dispatch({ type: 'goal/remove', id: p.goal.id });
                      toast('Goal removed', 'info');
                    }}
                  >
                    <IconTrash width={14} height={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adding && (
        <GoalDialog
          onClose={() => setAdding(false)}
          onSave={(g) => {
            dispatch({ type: 'goal/add', goal: g });
            toast(`Goal "${g.name}" created`);
            setAdding(false);
          }}
        />
      )}

      {contributing && (
        <ContributionDialog
          goal={contributing}
          onClose={() => setContributing(null)}
          onSave={(amount, date, note) => {
            dispatch({
              type: 'goal/contribute',
              id: contributing.id,
              contribution: { id: uid('c'), date, amount, note },
            });
            toast(`${formatINR(amount)} added to ${contributing.name}`);
            setContributing(null);
          }}
        />
      )}
    </div>
  );
}

function GoalDialog({ onClose, onSave }: { onClose: () => void; onSave: (g: Goal) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(GOAL_TYPES[0]);
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [monthly, setMonthly] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title="New savings goal"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const targetAmount = Number(target);
              if (!name.trim()) return setError('Give the goal a name');
              if (!Number.isFinite(targetAmount) || targetAmount <= 0) return setError('Enter a target above zero');
              onSave({
                id: uid('goal'),
                name: name.trim(),
                type,
                targetAmount,
                currentAmount: Number(current) || 0,
                monthlyContribution: Number(monthly) || undefined,
                targetDate: targetDate || undefined,
                note: note.trim() || undefined,
                createdAt: new Date().toISOString(),
                contributions: [],
              });
            }}
          >
            Create goal
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">Goal name</span>
          <input className="input" placeholder="e.g. Japan Trip" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} autoFocus />
        </label>
        <label className="block">
          <span className="label">Type</span>
          <Select value={type} onChange={(e) => setType(e.target.value)} options={GOAL_TYPES.map((t) => ({ value: t, label: t }))} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Target (₹)</span>
            <input className="input tnum" type="number" min="0" value={target} onChange={(e) => { setTarget(e.target.value); setError(''); }} />
          </label>
          <label className="block">
            <span className="label">Already saved (₹)</span>
            <input className="input tnum" type="number" min="0" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Monthly plan (₹)</span>
            <input className="input tnum" type="number" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Target date</span>
            <input className="input tnum" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="label">Note</span>
          <input className="input" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="text-xs text-critical">{error}</p>}
      </div>
    </Modal>
  );
}

function ContributionDialog({
  goal, onClose, onSave,
}: {
  goal: Goal;
  onClose: () => void;
  onSave: (amount: number, date: string, note?: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add to ${goal.name}`}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const value = Number(amount);
              if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount above zero');
              onSave(value, date, note.trim() || undefined);
            }}
          >
            Add contribution
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">Amount (₹)</span>
          <input className="input text-lg font-semibold tnum" type="number" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} autoFocus />
        </label>
        <label className="block">
          <span className="label">Date</span>
          <input className="input tnum" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Note</span>
          <input className="input" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="text-xs text-critical">{error}</p>}
        <p className="rounded-xl bg-plane px-3 py-2.5 text-xs text-muted">
          Contributions track the goal balance. They do not create ledger transactions — record the
          transfer separately if you want it in your expense history.
        </p>
      </div>
    </Modal>
  );
}
