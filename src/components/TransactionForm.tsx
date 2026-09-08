import { useMemo, useState } from 'react';
import type { Attachment, PaymentMode, Transaction, TxnKind } from '@/types';
import { PAYMENT_MODES } from '@/data/categories';
import { CURRENCIES } from '@/data/currencies';
import { convert, rateFor } from '@/engine/currency';
import { useStore } from '@/store/AppStore';
import { Button, Field, Segmented, Select, cx } from '@/components/ui/Primitives';
import { IconCamera, IconPlus, IconTrash, IconX } from '@/components/Icons';
import { formatMoney, round2, todayISO, uid } from '@/lib/utils';

export interface TxnFormValue {
  kind: TxnKind;
  date: string;
  amount: string;
  /** The currency the money was actually spent in. */
  currency: string;
  /** Home-currency units per one unit of `currency`; blank means look it up. */
  rate: string;
  merchant: string;
  category: string;
  subcategory: string;
  paymentMode: PaymentMode;
  accountId: string;
  remarks: string;
  tags: string[];
  location: string;
  attachmentIds: string[];
}

export function emptyForm(kind: TxnKind = 'expense', homeCurrency = 'INR'): TxnFormValue {
  return {
    kind,
    date: todayISO(),
    amount: '',
    currency: homeCurrency,
    rate: '',
    merchant: '',
    category: kind === 'income' ? 'Salary' : 'Food & Dining',
    subcategory: '',
    paymentMode: 'UPI',
    accountId: '',
    remarks: '',
    tags: [],
    location: '',
    attachmentIds: [],
  };
}

export function formFromTransaction(t: Transaction, homeCurrency = 'INR'): TxnFormValue {
  return {
    kind: t.kind,
    date: t.date,
    // Editing shows what was actually paid, in the currency it was paid in.
    amount: String(t.original ? t.original.amount : t.amount),
    currency: t.original?.currency ?? homeCurrency,
    rate: t.original ? String(t.original.rate) : '',
    merchant: t.merchant,
    category: t.category,
    subcategory: t.subcategory ?? '',
    paymentMode: t.paymentMode,
    accountId: t.accountId ?? '',
    remarks: t.remarks ?? '',
    tags: t.tags,
    location: t.location ?? '',
    attachmentIds: t.attachmentIds,
  };
}

export function validate(
  v: TxnFormValue,
  homeCurrency = 'INR',
  knownRate: number | null = null,
): Partial<Record<keyof TxnFormValue, string>> {
  const errors: Partial<Record<keyof TxnFormValue, string>> = {};
  const amount = Number(v.amount);
  if (!v.amount.trim()) errors.amount = 'Enter an amount';
  else if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Amount must be greater than zero';
  if (!v.date) errors.date = 'Pick a date';
  if (!v.category) errors.category = 'Choose a category';

  if (v.currency !== homeCurrency) {
    const typed = Number(v.rate);
    const usable = v.rate.trim() ? Number.isFinite(typed) && typed > 0 : knownRate !== null;
    if (!usable) {
      errors.rate = `Enter how many ${homeCurrency} one ${v.currency} is worth`;
    }
  }
  return errors;
}

export function toTransaction(
  v: TxnFormValue,
  existing?: Transaction,
  homeCurrency = 'INR',
  rateTable?: Parameters<typeof convert>[3],
): Transaction {
  const now = new Date().toISOString();
  const typedRate = v.rate.trim() ? Number(v.rate) : undefined;
  const converted = convert(Number(v.amount), v.currency, homeCurrency, rateTable, typedRate, now);
  return {
    id: existing?.id ?? uid('txn'),
    kind: v.kind,
    date: v.date,
    amount: converted.amount,
    original: converted.original,
    merchant: v.merchant.trim() || 'Unspecified',
    category: v.category,
    subcategory: v.subcategory || undefined,
    paymentMode: v.paymentMode,
    accountId: v.accountId || undefined,
    remarks: v.remarks.trim() || undefined,
    tags: v.tags,
    attachmentIds: v.attachmentIds,
    location: v.location.trim() || undefined,
    source: existing?.source ?? 'manual',
    originId: existing?.originId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * The shared entry form. Category and subcategory are dropdown-validated but
 * both accept new values, so a category the list does not have can be created
 * without leaving the form.
 */
export function TransactionForm({
  value, onChange, errors = {}, compact,
}: {
  value: TxnFormValue;
  onChange: (v: TxnFormValue) => void;
  errors?: Partial<Record<keyof TxnFormValue, string>>;
  compact?: boolean;
}) {
  const { state, dispatch, storeAttachment, toast } = useStore();
  const [tagDraft, setTagDraft] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const set = <K extends keyof TxnFormValue>(key: K, v: TxnFormValue[K]) => onChange({ ...value, [key]: v });

  const categories = useMemo(
    () => state.categories.filter((c) => c.kind === value.kind),
    [state.categories, value.kind],
  );
  const subcategories = useMemo(
    () => categories.find((c) => c.name === value.category)?.subcategories ?? [],
    [categories, value.category],
  );
  const accounts = state.accounts.filter((a) => !a.archived);

  const homeCurrency = state.settings.currency;
  const foreign = value.currency !== homeCurrency;
  const lookedUpRate = foreign ? rateFor(value.currency, homeCurrency, state.settings.rateTable) : null;
  const effectiveRate = value.rate.trim() ? Number(value.rate) : lookedUpRate;
  const converted =
    foreign && effectiveRate && Number.isFinite(effectiveRate) && Number(value.amount) > 0
      ? round2(Number(value.amount) * effectiveRate)
      : null;

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase();
    if (!tag || value.tags.includes(tag)) {
      setTagDraft('');
      return;
    }
    onChange({ ...value, tags: [...value.tags, tag] });
    setTagDraft('');
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    dispatch({ type: 'category/add', category: { name, kind: value.kind, subcategories: [] } });
    onChange({ ...value, category: name, subcategory: '' });
    setNewCategory('');
    setAddingCategory(false);
    toast(`Category "${name}" added`);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const ids: string[] = [];
    const metas: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 8 * 1024 * 1024) {
        toast(`${file.name} is over 8 MB and was skipped`, 'error');
        continue;
      }
      const id = await storeAttachment(file);
      ids.push(id);
      metas.push({ id, name: file.name, mime: file.type, size: file.size, createdAt: new Date().toISOString() });
    }
    if (ids.length) {
      setAttachments((prev) => [...prev, ...metas]);
      onChange({ ...value, attachmentIds: [...value.attachmentIds, ...ids] });
    }
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={value.kind}
        onChange={(kind) =>
          onChange({
            ...value,
            kind,
            category: kind === 'income' ? 'Salary' : 'Food & Dining',
            subcategory: '',
          })
        }
        options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
        className="w-full sm:w-auto"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" error={errors.amount} className="col-span-2 sm:col-span-1">
          <div className="flex gap-2">
            <input
              className="input text-lg font-semibold tnum"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={value.amount}
              onChange={(e) => set('amount', e.target.value)}
              autoFocus
            />
            <Select
              aria-label="Currency"
              className="w-28 shrink-0"
              value={value.currency}
              onChange={(e) => onChange({ ...value, currency: e.target.value, rate: '' })}
              options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            />
          </div>
        </Field>

        <Field label="Date" error={errors.date} className="col-span-2 sm:col-span-1">
          <input className="input tnum" type="date" value={value.date} max={todayISO()} onChange={(e) => set('date', e.target.value)} />
        </Field>

        <Field label={value.kind === 'income' ? 'Source / Payer' : 'Merchant / Vendor'} className="col-span-2">
          <input
            className="input"
            placeholder={value.kind === 'income' ? 'e.g. Acme Technologies' : 'e.g. Swiggy'}
            value={value.merchant}
            onChange={(e) => set('merchant', e.target.value)}
            list="merchant-suggestions"
          />
        </Field>

        <Field
          label="Category"
          error={errors.category}
          hint={value.category === 'Transfers' ? 'Transfers move money between your own accounts and are left out of income and spending totals.' : undefined}
          className="col-span-2 sm:col-span-1"
        >
          <Select
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value, subcategory: '' })}
            options={categories.map((c) => ({ value: c.name, label: c.name }))}
          />
        </Field>

        <Field label="Subcategory" className="col-span-2 sm:col-span-1">
          <input
            className="input"
            list="subcategory-options"
            placeholder={subcategories[0] ?? 'Optional'}
            value={value.subcategory}
            onChange={(e) => set('subcategory', e.target.value)}
          />
          <datalist id="subcategory-options">
            {subcategories.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>

      {foreign && (
        <div className="rounded-xl border border-line bg-plane p-3">
          <Field
            label={`Rate — ${homeCurrency} per 1 ${value.currency}`}
            error={errors.rate}
            hint={
              lookedUpRate !== null && !value.rate.trim()
                ? `Using ${round2(lookedUpRate)} from the rates last fetched. Type your own to override — a bank's own rate includes its fees.`
                : 'Type the rate your bank actually used, if you know it.'
            }
          >
            <input
              className="input tnum"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              placeholder={lookedUpRate !== null ? String(round2(lookedUpRate)) : '0.00'}
              value={value.rate}
              onChange={(e) => set('rate', e.target.value)}
            />
          </Field>

          <p className="mt-2 text-xs text-muted">
            {converted !== null ? (
              <>
                Recorded as <strong className="tnum text-ink">{formatMoney(converted)}</strong> in your
                ledger. The original {value.currency} amount and this rate are kept with the transaction.
              </>
            ) : (
              <>A rate is needed before this can be recorded in {homeCurrency}.</>
            )}
          </p>
        </div>
      )}

      {addingCategory ? (
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="New category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
          />
          <Button variant="primary" onClick={addCategory}>Add</Button>
          <Button variant="quiet" onClick={() => setAddingCategory(false)}><IconX width={16} height={16} /></Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAddingCategory(true)} className="text-xs font-semibold text-accent hover:underline">
          + Add a custom category
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Payment mode" className="col-span-2 sm:col-span-1">
          <Select
            value={value.paymentMode}
            onChange={(e) => set('paymentMode', e.target.value as PaymentMode)}
            options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
          />
        </Field>

        <Field label="Bank account / card" className="col-span-2 sm:col-span-1">
          <Select
            value={value.accountId}
            onChange={(e) => set('accountId', e.target.value)}
            options={[
              { value: '', label: 'Not linked' },
              ...accounts.map((a) => ({
                value: a.id,
                label: `${a.cardName || a.accountName} · ${a.bankName} ····${a.last4}`,
              })),
            ]}
          />
        </Field>
      </div>

      {!compact && (
        <Field label="Location">
          <input className="input" placeholder="Optional — e.g. Kochi" value={value.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
      )}

      <Field label="Remarks">
        <textarea
          className="input min-h-[70px] resize-y"
          placeholder="Anything worth remembering about this transaction"
          value={value.remarks}
          onChange={(e) => set('remarks', e.target.value)}
        />
      </Field>

      <div>
        <span className="label">Tags</span>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.tags.map((tag) => (
            <span key={tag} className="chip">
              #{tag}
              <button type="button" onClick={() => onChange({ ...value, tags: value.tags.filter((t) => t !== tag) })} aria-label={`Remove ${tag}`}>
                <IconX width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Add a tag and press Enter"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          />
          <Button onClick={addTag} aria-label="Add tag"><IconPlus width={16} height={16} /></Button>
        </div>
      </div>

      <div>
        <span className="label">Bill / receipt</span>
        <label className={cx('flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line',
          'bg-raised px-4 py-4 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent')}>
          <IconCamera width={18} height={18} />
          Attach an image or PDF
          <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => void onFiles(e.target.files)} />
        </label>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg bg-plane px-2.5 py-1.5 text-xs">
                <span className="truncate text-muted">{a.name}</span>
                <span className="ml-auto shrink-0 tnum text-subtle">{Math.round(a.size / 1024)} KB</span>
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => {
                    setAttachments((prev) => prev.filter((x) => x.id !== a.id));
                    onChange({ ...value, attachmentIds: value.attachmentIds.filter((id) => id !== a.id) });
                  }}
                  className="text-subtle hover:text-critical"
                >
                  <IconTrash width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <datalist id="merchant-suggestions">
        {[...new Set(state.transactions.map((t) => t.merchant))].slice(0, 60).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}
