import { useMemo, useState } from 'react';
import type { PendingItem } from '@/types';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, EmptyState, Modal, Segmented, cx } from '@/components/ui/Primitives';
import { TransactionForm, type TxnFormValue, validate } from '@/components/TransactionForm';
import { ExtractionPreview } from '@/pages/Capture';
import { IconCheck, IconEdit, IconInbox, IconShield, IconTrash, IconX } from '@/components/Icons';
import { confidenceBand } from '@/engine/parser';
import { formatINR, todayISO } from '@/lib/utils';

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
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [editing, setEditing] = useState<PendingItem | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const items = useMemo(
    () => state.pending.filter((p) => p.status === filter).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [state.pending, filter],
  );
  const pendingCount = state.pending.filter((p) => p.status === 'pending').length;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const approve = (item: PendingItem) => {
    if (!item.draft.amount || item.draft.amount <= 0) {
      toast('Add an amount before approving this one', 'error');
      setEditing(item);
      return;
    }
    dispatch({ type: 'pending/approve', id: item.id });
    setSelected((prev) => prev.filter((x) => x !== item.id));
    toast(`${formatINR(item.draft.amount)} posted to your ledger`);
  };

  const approveSelected = () => {
    const valid = items.filter((i) => selected.includes(i.id) && i.draft.amount > 0);
    if (!valid.length) {
      toast('Nothing selected can be approved yet', 'error');
      return;
    }
    dispatch({ type: 'pending/approveMany', ids: valid.map((i) => i.id) });
    toast(`${valid.length} transaction${valid.length === 1 ? '' : 's'} posted`);
    setSelected([]);
  };

  return (
    <div className="space-y-4">
      <Card
        title="Pending approval"
        subtitle="Nothing here has touched your ledger yet"
        action={
          <Segmented
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setSelected([]);
            }}
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
            Approval is mandatory. Only what you approve updates the expense ledger, dashboard,
            reports and analytics.
          </p>
        </div>

        {filter === 'pending' && items.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              variant="quiet"
              onClick={() => setSelected(selected.length === items.length ? [] : items.map((i) => i.id))}
            >
              {selected.length === items.length ? 'Clear selection' : 'Select all'}
            </Button>
            {selected.length > 0 && (
              <Button variant="primary" onClick={approveSelected}>
                <IconCheck width={16} height={16} /> Approve {selected.length}
              </Button>
            )}
          </div>
        )}

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
                selected={selected.includes(item.id)}
                onToggle={() => toggle(item.id)}
                onApprove={() => approve(item)}
                onEdit={() => setEditing(item)}
                onReject={() => {
                  dispatch({ type: 'pending/reject', id: item.id });
                  toast('Rejected — nothing was posted', 'info');
                }}
                onDelete={() => dispatch({ type: 'pending/remove', id: item.id })}
              />
            ))}
          </ul>
        )}

        {filter !== 'pending' && items.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <Button variant="quiet" onClick={() => dispatch({ type: 'pending/clearReviewed' })}>
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
            toast(`${formatINR(draft.amount)} posted after your edits`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PendingCard({
  item, accounts, selected, onToggle, onApprove, onEdit, onReject, onDelete,
}: {
  item: PendingItem;
  accounts: Array<{ id: string; bankName: string; accountName: string; cardName?: string; last4: string }>;
  selected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const band = confidenceBand(item.extraction.confidence);
  const tone = band === 'high' ? 'good' : band === 'medium' ? 'warning' : 'critical';
  const isPending = item.status === 'pending';
  const account = accounts.find((a) => a.id === item.draft.accountId);
  const noAmount = !item.draft.amount || item.draft.amount <= 0;

  return (
    <li className={cx('rounded-card border bg-plane p-3 transition-colors', selected ? 'border-accent' : 'border-line')}>
      <div className="flex items-start gap-3">
        {isPending && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label="Select for bulk approval"
            className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cx('text-base font-bold tnum', noAmount ? 'text-critical' : 'text-ink')}>
              {noAmount ? 'Amount missing' : formatINR(item.draft.amount)}
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
          <Button variant="primary" onClick={onApprove} disabled={noAmount}>
            <IconCheck width={16} height={16} /> Approve
          </Button>
          <Button onClick={onEdit}>
            <IconEdit width={15} height={15} /> Edit &amp; approve
          </Button>
          <Button variant="danger" onClick={onReject}>
            <IconX width={15} height={15} /> Reject
          </Button>
        </div>
      )}
      {!isPending && (
        <div className="mt-3">
          <Button variant="quiet" onClick={onDelete}>
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
  const [form, setForm] = useState<TxnFormValue>({
    kind: item.draft.kind,
    date: item.draft.date || todayISO(),
    amount: item.draft.amount ? String(item.draft.amount) : '',
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

  const submit = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    onSubmit({
      kind: form.kind,
      date: form.date,
      amount: Number(form.amount),
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
      title="Review and approve"
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
      <TransactionForm value={form} onChange={setForm} errors={errors} />
    </Modal>
  );
}
