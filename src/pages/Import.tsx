import { useMemo, useRef, useState } from 'react';
import type { Route } from '@/components/Shell';
import type { Transaction } from '@/types';
import { useStore } from '@/store/AppStore';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Badge, Button, Card, EmptyState, Field, Select, cx } from '@/components/ui/Primitives';
import { IconAlert, IconCheck, IconDownload, IconLedger } from '@/components/Icons';
import { formatMoney, uid } from '@/lib/utils';
import { track } from '@/sync/analytics';
import {
  buildRows, detectColumns, FIELD_LABEL, parseDelimited, readFile, summarise,
  type ColumnMap, type FieldName, type ImportRow, type RawTable,
} from '@/import';

/**
 * Bringing a ledger in from somewhere else.
 *
 * Someone arriving from another tracker, or from their bank's statement
 * download, has months of history that should not have to be retyped. The
 * import is deliberately a three-step conversation rather than a single
 * button: read the file, agree what its columns mean, then look at every row
 * that is about to be created. That last screen is the review — these entries
 * go straight to the ledger, which is only safe because nothing arrives
 * unseen.
 */

const FIELD_OPTIONS: FieldName[] = [
  'ignore', 'date', 'description', 'merchant', 'amount', 'debit', 'credit',
  'kind', 'category', 'subcategory', 'paymentMode', 'account', 'balance', 'remarks', 'tags',
];

export function Import({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state, dispatch, toast } = useStore();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [table, setTable] = useState<RawTable | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [dayFirst, setDayFirst] = useState(true);
  const [notes, setNotes] = useState<string[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Rows the person has unticked or re-ticked by hand. */
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  /** Categories the person has corrected on the preview. */
  const [categoryEdits, setCategoryEdits] = useState<Record<number, string>>({});

  const accept = (next: RawTable, name: string) => {
    if (!next.headers.length) {
      setError('That file has no readable rows.');
      return;
    }
    const detected = detectColumns(next);
    setTable(next);
    setMap(detected.map);
    setDayFirst(detected.dayFirst);
    setNotes(detected.notes);
    setSourceName(name);
    setOverrides({});
    setCategoryEdits({});
    setError(null);
  };

  const onFile = async (file: File) => {
    try {
      accept(await readFile(file), file.name);
      void track('feature_used', { feature: 'import', source: 'file' });
    } catch (err) {
      setTable(null);
      setError(err instanceof Error ? err.message : 'That file could not be read.');
    }
  };

  const rows = useMemo(() => {
    if (!table) return [];
    const built = buildRows(table, map, {
      dayFirst,
      categories: state.categories,
      existing: state.transactions,
    });
    return built.map((r) => ({
      ...r,
      include: overrides[r.line] ?? r.include,
      draft: r.draft && categoryEdits[r.line] ? { ...r.draft, category: categoryEdits[r.line] } : r.draft,
    }));
  }, [table, map, dayFirst, state.categories, state.transactions, overrides, categoryEdits]);

  const summary = useMemo(() => summarise(rows), [rows]);

  const setAll = (include: boolean) => {
    const next: Record<number, boolean> = {};
    for (const r of rows) if (r.draft) next[r.line] = include;
    setOverrides(next);
  };

  const doImport = async () => {
    const chosen = rows.filter((r) => r.include && r.draft);
    if (!chosen.length) return;

    const dupes = chosen.filter((r) => r.duplicateOf).length;
    const ok = await confirm({
      title: `Import ${chosen.length} transaction${chosen.length === 1 ? '' : 's'}?`,
      message: dupes
        ? `${dupes} of them look like entries already in your ledger. They will be added again as separate transactions.`
        : 'These will be added to your ledger straight away. You can edit or delete any of them afterwards.',
      confirmLabel: 'Import',
    });
    if (!ok) return;

    const now = new Date().toISOString();
    const txns: Transaction[] = chosen.map((r) => ({
      id: uid('txn'),
      kind: r.draft!.kind,
      date: r.draft!.date,
      amount: r.draft!.amount,
      merchant: r.draft!.merchant,
      category: r.draft!.category,
      subcategory: r.draft!.subcategory,
      paymentMode: r.draft!.paymentMode,
      remarks: r.draft!.remarks,
      tags: [...r.draft!.tags, 'imported'],
      attachmentIds: [],
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    }));

    dispatch({ type: 'txn/addMany', txns });
    void track('feature_used', { feature: 'import', outcome: 'approved' });
    toast(`Imported ${txns.length} transaction${txns.length === 1 ? '' : 's'} from ${sourceName || 'your file'}`);
    onNavigate('transactions');
  };

  return (
    <div className="space-y-4">
      <Card
        title="Import from another app or your bank"
        subtitle="Bring in history you already have, rather than typing it again"
      >
        <p className="text-xs leading-relaxed text-muted">
          Export your data from whatever you use now — most trackers offer CSV or Excel — or download a
          statement from your bank's net banking. Drop the file here and FinSight will work out what the
          columns mean. Nothing is added until you have seen every row.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="btn-primary cursor-pointer justify-center">
            <IconDownload width={16} height={16} /> Choose a CSV or Excel file
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xlsm"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
          </label>
          {table && (
            <Button
              onClick={() => {
                setTable(null);
                setPasted('');
                setError(null);
              }}
            >
              Start over
            </Button>
          )}
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-critical/35 bg-critical/10 px-3 py-2.5 text-xs leading-relaxed text-ink">
            <IconAlert width={15} height={15} className="mt-0.5 shrink-0 text-critical" />
            {error}
          </p>
        )}

        {!table && (
          <div className="mt-4 border-t border-line pt-3">
            <Field
              label="Or paste the rows"
              hint="Copy the table out of a PDF statement or a spreadsheet and paste it here."
            >
              <textarea
                className="input min-h-28 font-mono text-[11px]"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={'Date,Description,Amount\n02/03/2026,Swiggy,-486'}
              />
            </Field>
            <Button
              className="mt-2"
              disabled={pasted.trim().length < 10}
              onClick={() => {
                accept(parseDelimited(pasted), 'pasted rows');
                void track('feature_used', { feature: 'import', source: 'text' });
              }}
            >
              Read these rows
            </Button>
          </div>
        )}
      </Card>

      {table && (
        <Card title="What the columns mean" subtitle={`${sourceName} · ${table.rows.length} rows`}>
          {notes.map((n) => (
            <p key={n} className="mb-2 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-ink">
              {n}
            </p>
          ))}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {table.headers.map((header, i) => (
              <Field
                key={`${header}-${i}`}
                label={header || `Column ${i + 1}`}
                hint={table.rows[0]?.[i] ? `e.g. ${table.rows[0][i]}` : undefined}
              >
                <Select
                  value={map[i] ?? 'ignore'}
                  onChange={(e) => setMap({ ...map, [i]: e.target.value as FieldName })}
                  options={FIELD_OPTIONS.map((f) => ({ value: f, label: FIELD_LABEL[f] }))}
                />
              </Field>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={dayFirst}
              onChange={(e) => setDayFirst(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Dates are day first — 03/04 means 3 April
          </label>
        </Card>
      )}

      {table && (
        <Card
          title="Check what will be added"
          subtitle={
            summary.selected
              ? `${summary.selected} of ${summary.total} rows · ${summary.from} to ${summary.to}`
              : 'Nothing selected'
          }
        >
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Expenses" value={formatMoney(summary.expenseTotal)} sub={`${summary.expenseCount} rows`} />
            <Stat label="Income" value={formatMoney(summary.incomeTotal)} sub={`${summary.incomeCount} rows`} />
            <Stat label="Already in ledger" value={String(summary.duplicates)} sub="unticked by default" />
            <Stat label="Could not read" value={String(summary.failed)} sub="left out" />
          </div>

          {summary.guessed > 0 && (
            <p className="mb-3 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-ink">
              <strong>{summary.guessed}</strong> categor{summary.guessed === 1 ? 'y was' : 'ies were'} worked out
              from the description rather than read from the file. They are marked below — correct any that are
              wrong before importing, or fix them in the ledger afterwards.
            </p>
          )}

          <div className="mb-3 flex flex-wrap gap-2">
            <Button onClick={() => setAll(true)}>Tick all</Button>
            <Button onClick={() => setAll(false)}>Untick all</Button>
          </div>

          <div className="-mx-3 overflow-x-auto px-3">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-line text-left text-subtle">
                  <th className="w-8 py-2" />
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Merchant</th>
                  <th className="py-2 font-semibold">Category</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => (
                  <Row
                    key={r.line}
                    row={r}
                    categories={state.categories}
                    onToggle={() => setOverrides({ ...overrides, [r.line]: !r.include })}
                    onCategory={(c) => setCategoryEdits({ ...categoryEdits, [r.line]: c })}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 300 && (
            <p className="mt-2 text-[11px] text-subtle">
              Showing the first 300 rows. All {rows.length} will be imported if ticked.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <Button variant="primary" disabled={!summary.selected} onClick={() => void doImport()}>
              <IconCheck width={16} height={16} /> Import {summary.selected} transaction
              {summary.selected === 1 ? '' : 's'}
            </Button>
          </div>
        </Card>
      )}

      {!table && !error && (
        <Card>
          <EmptyState
            icon={<IconLedger width={30} height={30} />}
            title="Nothing loaded yet"
            detail="CSV and Excel files work directly. PDF statements need to be downloaded again as CSV from your bank, or the rows copied and pasted above."
          />
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-plane px-3 py-2">
      <p className="text-[11px] text-subtle">{label}</p>
      <p className="text-sm font-bold tnum text-ink">{value}</p>
      <p className="text-[10px] text-subtle">{sub}</p>
    </div>
  );
}

function Row({
  row, categories, onToggle, onCategory,
}: {
  row: ImportRow;
  categories: Array<{ name: string; kind: string }>;
  onToggle: () => void;
  onCategory: (c: string) => void;
}) {
  if (!row.draft) {
    return (
      <tr className="border-b border-line/60 text-subtle">
        <td className="py-2" />
        <td className="py-2" colSpan={4}>
          Row {row.line}: {row.problem}
        </td>
      </tr>
    );
  }

  const d = row.draft;
  const pool = categories.filter((c) => c.kind === d.kind || c.name === 'Transfers');

  return (
    <tr className={cx('border-b border-line/60', !row.include && 'opacity-45')}>
      <td className="py-2">
        <input
          type="checkbox"
          checked={row.include}
          onChange={onToggle}
          aria-label={`Import row ${row.line}`}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </td>
      <td className="py-2 tnum text-muted">{d.date}</td>
      <td className="max-w-[220px] truncate py-2 text-ink" title={d.merchant}>
        {d.merchant}
        {row.duplicateOf && (
          <Badge tone="warning" className="ml-1.5">
            already have this
          </Badge>
        )}
      </td>
      <td className="py-2">
        <select
          value={d.category}
          onChange={(e) => onCategory(e.target.value)}
          className={cx(
            'w-full rounded-lg border bg-transparent px-1.5 py-1 text-xs',
            row.guessedCategory ? 'border-warning/50 text-warning' : 'border-line text-muted',
          )}
        >
          {pool.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td className={cx('py-2 text-right font-semibold tnum', d.kind === 'income' ? 'text-good' : 'text-ink')}>
        {d.kind === 'income' ? '+' : '−'}
        {formatMoney(d.amount)}
      </td>
    </tr>
  );
}
