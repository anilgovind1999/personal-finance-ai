import { useMemo, useState } from 'react';
import type { PendingItem } from '@/types';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, EmptyState, Modal, Segmented, cx } from '@/components/ui/Primitives';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { TransactionForm, type TxnFormValue, validate } from '@/components/TransactionForm';
import { ExtractionPreview } from '@/pages/Capture';
import { IconCheck, IconEdit, IconInbox, IconShield, IconTrash, IconX } from '@/components/Icons';
import { confidenceBand } from '@/engine/parser';
import { convert, rateFor } from '@/engine/currency';
import { formatMoney, todayISO } from '@/lib/utils';

const SOURCE_LABEL: Record<string, string> = {
  sms: 'SMS', upi: 'UPI alert', whatsapp: 'WhatsApp', bank: 'Bank message',
  text: 'Typed note', receipt: 'Receipt scan', manual: 'Manual',
};

/**
 * The mandatory review queue. An AI-captured transaction only becomes a ledger
 * entry when it is approved here — approve, edit and approve, or reject.
 */
export function Approvals() {
  const { state, dispatch, toast } = useStore();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [editing, setEditing] = useState<PendingItem | null>(null);

  const items = useMemo(
    () => state.pending.filter((p) => p.status === filter).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [state.pending, filter],
  );
  const pendingCount = state.pending.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-4">
      <Card
        title="Pending approval"
        subtitle="Nothing here has touched your ledger yet"
        action={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'pending', label: `Pending${pendingCount ? ` (${pendingCount})` : ''}` },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        }
      >
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-plane px-3 py-2.5">
          <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Approval is mandatory, and every item is opened for review first — a bank message rarely
            says what an expense was <em>for</em>, so the category is a guess until you confirm it. Only
            what you approve updates the ledger, dashboard, reports and analytics.
          </p>
        </div>


        {items.length === 0 ? (
          <EmptyState
            icon={<IconInbox width={30} height={30} />}
            title={filter === 'pending' ? 'The queue is clear' : `No ${filter} items`}
            detail={
              filter === 'pending'
                ? 'Capture a message or a receipt and the AI reading will appear here for review.'
                : undefined
            }
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <PendingCard
                key={item.id}
                item={item}
                accounts={state.accounts}
                onReview={() => setEditing(item)}
                onReject={async () => {
                  const ok = await confirm({
                    title: 'Reject this transaction?',
                    message: (
                      <>
                        <strong>
                          {item.draft.amount ? formatMoney(item.draft.amount) : 'This item'} at {item.draft.merchant}
                        </strong>{' '}
                        will not be added to your ledger.
                      </>
                    ),
                    reassurance: `It moves to the Rejected tab, and stays recoverable in the recycle bin for ${state.settings.retentionDays} days if you remove it from there.`,
                    confirmLabel: 'Reject',
                  });
                  if (!ok) return;
                  dispatch({ type: 'pending/reject', id: item.id });
                  toast('Rejected — nothing was posted', 'info');
                }}
                onDelete={async () => {
                  const ok = await confirm({
                    title: 'Remove from history?',
                    message: 'This captured message will no longer appear in your review history.',
                    reassurance: `It goes to the recycle bin and can be restored for ${state.settings.retentionDays} days.`,
                    confirmLabel: 'Remove',
                  });
                  if (!ok) return;
                  dispatch({ type: 'pending/remove', id: item.id });
                  toast('Moved to the recycle bin', 'info');
                }}
              />
            ))}
          </ul>
        )}

        {filter !== 'pending' && items.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <Button
              variant="quiet"
              onClick={async () => {
                const reviewed = state.pending.filter((p) => p.status !== 'pending').length;
                const ok = await confirm({
                  title: 'Clear reviewed history?',
                  message: `${reviewed} approved and rejected capture${reviewed === 1 ? '' : 's'} will be cleared from this list.`,
                  reassurance: `Approved transactions stay in your ledger. The cleared records go to the recycle bin for ${state.settings.retentionDays} days.`,
                  confirmLabel: 'Clear history',
                });
                if (!ok) return;
                dispatch({ type: 'pending/clearReviewed' });
                toast('Reviewed history cleared', 'info');
              }}
            >
              <IconTrash width={15} height={15} /> Clear reviewed history
            </Button>
          </div>
        )}
      </Card>

      {editing && (
        <EditAndApprove
          item={editing}
          onClose={() => setEditing(null)}
          onSubmit={(draft) => {
            dispatch({ type: 'pending/approve', id: editing.id, draft });
            toast(`${formatMoney(draft.amount)} posted after your edits`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PendingCard({
  item, accounts, onReview, onReject, onDelete,
}: {
  item: PendingItem;
  accounts: Array<{ id: string; bankName: string; accountName: string; cardName?: string; last4: string }>;
  onReview: () => void;
  onReject: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const band = confidenceBand(item.extraction.confidence);
  const tone = band === 'high' ? 'good' : band === 'medium' ? 'warning' : 'critical';
  const isPending = item.status === 'pending';
  const account = accounts.find((a) => a.id === item.draft.accountId);
  const noAmount = !item.draft.amount || item.draft.amount <= 0;
  // Bank messages say what was charged, almost never what it was for.
  const uncertainCategory =
    item.draft.category === 'Other' ||
    item.draft.category === 'Other Income' ||
    item.extraction.category.confidence < 0.7;

  return (
    <li className="rounded-card border border-line bg-plane p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cx('text-base font-bold tnum', noAmount ? 'text-critical' : 'text-ink')}>
              {noAmount ? 'Amount missing' : formatMoney(item.draft.amount)}
            </span>
            <span className="truncate text-sm text-muted">{item.draft.merchant}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={tone}>{Math.round(item.extraction.confidence * 100)}%</Badge>
            <Badge tone="neutral">{item.draft.category}</Badge>
            <Badge tone="neutral">{item.draft.paymentMode}</Badge>
            <Badge tone="neutral">{item.draft.date}</Badge>
            {item.draft.kind === 'income' && <Badge tone="good">Income</Badge>}
            {account && <Badge tone="neutral">{account.cardName || account.accountName} ····{account.last4}</Badge>}
            <span className="text-[11px] text-subtle">via {SOURCE_LABEL[item.source] ?? item.source}</span>
          </div>

          <div className="mt-1.5">
            {uncertainCategory && (
              <p className="text-[11px] font-medium text-warning">
                The category is a guess — check it before approving.
              </p>
            )}
          </div>

          {item.status === 'approved' && <p className="mt-1.5 text-[11px] font-semibold text-good">Approved and posted to the ledger</p>}
          {item.status === 'rejected' && (
            <p className="mt-1.5 text-[11px] font-semibold text-critical">
              Rejected{item.rejectionReason ? ` · ${item.rejectionReason}` : ''} — nothing was posted
            </p>
          )}

          <button type="button" onClick={() => setShowDetail((s) => !s)} className="mt-2 text-[11px] font-semibold text-accent hover:underline">
            {showDetail ? 'Hide AI reading' : 'Show AI reading'}
          </button>
        </div>
      </div>

      {showDetail && (
        <div className="mt-3">
          <ExtractionPreview raw={item.rawText} result={item.extraction} />
        </div>
      )}

      {isPending && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onReview}>
            <IconEdit width={15} height={15} /> Review &amp; approve
          </Button>
          <Button variant="danger" onClick={() => void onReject()}>
            <IconX width={15} height={15} /> Reject
          </Button>
          {noAmount && <span className="self-center text-[11px] text-critical">Needs an amount</span>}
        </div>
      )}
      {!isPending && (
        <div className="mt-3">
          <Button variant="quiet" onClick={() => void onDelete()}>
            <IconTrash width={14} height={14} /> Remove from history
          </Button>
        </div>
      )}
    </li>
  );
}

function EditAndApprove({
  item, onClose, onSubmit,
}: {
  item: PendingItem;
  onClose: () => void;
  onSubmit: (draft: PendingItem['draft']) => void;
}) {
  const { state } = useStore();
  const [form, setForm] = useState<TxnFormValue>({
    kind: item.draft.kind,
    date: item.draft.date || todayISO(),
    amount: item.draft.amount ? String(item.draft.amount) : '',
    currency: item.draft.original?.currency ?? state.settings.currency,
    rate: item.draft.original ? String(item.draft.original.rate) : '',
    merchant: item.draft.merchant,
    category: item.draft.category,
    subcategory: item.draft.subcategory ?? '',
    paymentMode: item.draft.paymentMode,
    accountId: item.draft.accountId ?? '',
    remarks: item.draft.remarks ?? '',
    tags: item.draft.tags,
    location: item.draft.location ?? '',
    attachmentIds: item.attachmentIds,
  });
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const weakCategory =
    item.draft.category === 'Other' ||
    item.draft.category === 'Other Income' ||
    item.extraction.category.confidence < 0.7;

  const submit = () => {
    const home = state.settings.currency;
    const known = rateFor(form.currency, home, state.settings.rateTable);
    const found = validate(form, home, known);
    setErrors(found);
    if (Object.keys(found).length) return;
    const typedRate = form.rate.trim() ? Number(form.rate) : undefined;
    const converted = convert(Number(form.amount), form.currency, home, state.settings.rateTable, typedRate);
    onSubmit({
      kind: form.kind,
      date: form.date,
      amount: converted.amount,
      original: converted.original,
      merchant: form.merchant.trim() || 'Unknown',
      category: form.category,
      subcategory: form.subcategory || undefined,
      paymentMode: form.paymentMode,
      accountId: form.accountId || undefined,
      remarks: form.remarks.trim() || undefined,
      tags: form.tags,
      location: form.location.trim() || undefined,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Review & approve"
      wide
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            <IconCheck width={16} height={16} /> Approve &amp; post
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <ExtractionPreview raw={item.rawText} result={item.extraction} />
      </div>

      {weakCategory && (
        <p className="mb-4 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-ink">
          <strong>Check the category.</strong> This message did not say what the money was spent on, so
          "{item.draft.category}" is the app's best guess rather than something it read.
        </p>
      )}

      <TransactionForm value={form} onChange={setForm} errors={errors} />
    </Modal>
  );
}
