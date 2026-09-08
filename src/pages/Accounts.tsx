import { useMemo, useState } from 'react';
import type { Account, AccountType } from '@/types';
import { ACCOUNT_TYPES } from '@/data/categories';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, EmptyState, Modal, Progress, Select, cx } from '@/components/ui/Primitives';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { IconPlus, IconShield, IconTrash, IconWallet } from '@/components/Icons';
import { accountBalances } from '@/engine/analytics';
import { formatINR, todayISO, uid } from '@/lib/utils';

export function Accounts() {
  const { state, dispatch, toast } = useStore();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);

  const balances = useMemo(
    () => accountBalances(state.accounts, state.transactions),
    [state.accounts, state.transactions],
  );

  return (
    <div className="space-y-4">
      <Card
        title="Account master"
        subtitle="Bank accounts, cards, wallets and cash"
        action={<Button variant="primary" onClick={() => setAdding(true)}><IconPlus width={16} height={16} /> Add account</Button>}
      >
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-plane px-3 py-2.5">
          <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Only the last four digits are ever stored or shown. Full account and card numbers are never
            requested, saved or transmitted — all data stays in this browser.
          </p>
        </div>

        {balances.length === 0 ? (
          <EmptyState
            icon={<IconWallet width={30} height={30} />}
            title="No accounts yet"
            detail="Add your bank accounts and cards so spending can be traced to the right place."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {balances.map(({ account, balance, spend, credits, outstanding, utilisation }) => {
              const isCard = account.accountType === 'Credit Card';
              return (
                <li key={account.id} className={cx('rounded-card border border-line bg-plane p-4', account.archived && 'opacity-60')}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{account.cardName || account.accountName}</p>
                      <p className="text-[11px] text-muted">{account.bankName} · {account.accountType}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-bold tnum"
                      style={{ background: `${account.color ?? '#898781'}22`, color: account.color ?? 'rgb(var(--ink-muted))' }}
                    >
                      ····{account.last4}
                    </span>
                  </div>

                  <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">
                    {isCard ? 'Outstanding' : 'Balance'}
                  </p>
                  <p className={cx('text-xl font-bold tnum', isCard && outstanding > 0 ? 'text-warning' : balance < 0 ? 'text-critical' : 'text-ink')}>
                    {formatINR(balance, true)}
                  </p>

                  {isCard && account.creditLimit ? (
                    <div className="mt-2">
                      <Progress value={utilisation ?? 0} tone={(utilisation ?? 0) > 70 ? 'critical' : (utilisation ?? 0) > 30 ? 'warning' : 'good'} />
                      <p className="mt-1 text-[11px] text-muted">
                        {utilisation}% of {formatINR(account.creditLimit, true)} limit
                        {account.statementDay ? ` · statement on the ${ordinal(account.statementDay)}` : ''}
                        {account.dueDay ? ` · due on the ${ordinal(account.dueDay)}` : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">
                      Opening {formatINR(account.openingBalance, true)} · {formatINR(credits, true)} in · {formatINR(spend, true)} out
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => setEditing(account)}>Edit</Button>
                    <Button
                      variant="quiet"
                      onClick={async () => {
                        const linked = state.transactions.filter((t) => t.accountId === account.id).length;
                        const ok = await confirm({
                          title: 'Remove this account?',
                          message: (
                            <>
                              <strong>{account.cardName || account.accountName} ····{account.last4}</strong> will be
                              removed from your account list.
                            </>
                          ),
                          reassurance:
                            linked > 0
                              ? `${linked} transaction${linked === 1 ? '' : 's'} linked to it are kept — they simply stop being attached to an account.`
                              : 'No transactions are linked to it.',
                          confirmLabel: 'Remove account',
                        });
                        if (!ok) return;
                        dispatch({ type: 'account/remove', id: account.id });
                        toast('Account removed — its transactions were kept', 'info');
                      }}
                    >
                      <IconTrash width={14} height={14} />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(adding || editing) && (
        <AccountDialog
          account={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={(a) => {
            dispatch(editing ? { type: 'account/update', account: a } : { type: 'account/add', account: a });
            toast(editing ? 'Account updated' : 'Account added');
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#008300', '#e34948'];

function AccountDialog({
  account, onClose, onSave,
}: {
  account: Account | null;
  onClose: () => void;
  onSave: (a: Account) => void;
}) {
  const [bankName, setBankName] = useState(account?.bankName ?? '');
  const [accountName, setAccountName] = useState(account?.accountName ?? '');
  const [accountType, setAccountType] = useState<AccountType>(account?.accountType ?? 'Savings');
  const [last4, setLast4] = useState(account?.last4 ?? '');
  const [cardName, setCardName] = useState(account?.cardName ?? '');
  const [creditLimit, setCreditLimit] = useState(account?.creditLimit ? String(account.creditLimit) : '');
  const [statementDay, setStatementDay] = useState(account?.statementDay ? String(account.statementDay) : '');
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : '');
  const [openingBalance, setOpeningBalance] = useState(String(account?.openingBalance ?? ''));
  const [color, setColor] = useState(account?.color ?? COLORS[0]);
  const [error, setError] = useState('');

  const isCard = accountType === 'Credit Card';

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? 'Edit account' : 'Add account'}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!bankName.trim()) return setError('Enter the bank or provider name');
              if (!accountName.trim()) return setError('Give the account a name');
              if (!/^\d{4}$/.test(last4)) return setError('Enter exactly the last 4 digits');
              onSave({
                id: account?.id ?? uid('acc'),
                bankName: bankName.trim(),
                accountName: accountName.trim(),
                accountType,
                last4,
                cardName: cardName.trim() || undefined,
                creditLimit: isCard && creditLimit ? Number(creditLimit) : undefined,
                statementDay: isCard && statementDay ? Number(statementDay) : undefined,
                dueDay: isCard && dueDay ? Number(dueDay) : undefined,
                openingBalance: Number(openingBalance) || 0,
                color,
                archived: account?.archived,
                createdAt: account?.createdAt ?? new Date().toISOString(),
              });
            }}
          >
            {account ? 'Save changes' : 'Add account'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Bank / provider</span>
            <input className="input" placeholder="e.g. HDFC Bank" value={bankName} onChange={(e) => { setBankName(e.target.value); setError(''); }} autoFocus />
          </label>
          <label className="block">
            <span className="label">Account name</span>
            <input className="input" placeholder="e.g. Salary Account" value={accountName} onChange={(e) => { setAccountName(e.target.value); setError(''); }} />
          </label>
          <label className="block">
            <span className="label">Account type</span>
            <Select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))} />
          </label>
          <label className="block">
            <span className="label">Last 4 digits</span>
            <input
              className="input tnum"
              inputMode="numeric"
              maxLength={4}
              placeholder="4521"
              value={last4}
              onChange={(e) => { setLast4(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
            />
          </label>
        </div>

        {isCard && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-plane p-3">
            <label className="col-span-2 block">
              <span className="label">Card name</span>
              <input className="input" placeholder="e.g. Amazon Pay ICICI" value={cardName} onChange={(e) => setCardName(e.target.value)} />
            </label>
            <label className="col-span-2 block">
              <span className="label">Credit limit (₹)</span>
              <input className="input tnum" type="number" min="0" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Statement day</span>
              <input className="input tnum" type="number" min="1" max="31" placeholder="18" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Due day</span>
              <input className="input tnum" type="number" min="1" max="31" placeholder="5" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </label>
          </div>
        )}

        {!isCard && (
          <label className="block">
            <span className="label">Opening balance (₹)</span>
            <input className="input tnum" type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            <span className="mt-1 block text-xs text-subtle">Balance as of today, before the transactions you record here.</span>
          </label>
        )}

        <div>
          <span className="label">Colour</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className={cx('h-8 w-8 rounded-lg border-2 transition-transform', color === c ? 'border-ink scale-110' : 'border-transparent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-critical">{error}</p>}
        <Badge tone="neutral">Added {account ? account.createdAt.slice(0, 10) : todayISO()}</Badge>
      </div>
    </Modal>
  );
}
