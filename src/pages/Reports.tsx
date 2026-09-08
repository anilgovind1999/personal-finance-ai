import { useMemo, useState } from 'react';
import { useStore } from '@/store/AppStore';
import { Button, Card, Select, cx } from '@/components/ui/Primitives';
import { IconDownload, IconReport } from '@/components/Icons';
import {
  buildReport, downloadCSV, downloadExcel, downloadPDF, transactionsToCSV, type ReportKind,
} from '@/export/exporters';
import { expensesOf, monthRange, totalOf } from '@/engine/analytics';
import { addMonthsToKey, daysInMonth, downloadBlob, formatINR, inArtifactHost, monthKey, monthLabel, todayISO } from '@/lib/utils';

const REPORTS: Array<{ kind: ReportKind; title: string; detail: string }> = [
  { kind: 'monthly', title: 'Monthly Expense Report', detail: 'Month summary, category split and every transaction.' },
  { kind: 'annual', title: 'Annual Expense Report', detail: 'Twelve-month view of income, expenses and net position.' },
  { kind: 'income', title: 'Income Report', detail: 'Every credit, grouped by source and category.' },
  { kind: 'savings', title: 'Savings Report', detail: 'Monthly savings rate and goal progress.' },
  { kind: 'cashflow', title: 'Cash Flow Report', detail: 'Inflow, outflow and cumulative position by month.' },
  { kind: 'category', title: 'Category Report', detail: 'Category and subcategory breakdown with shares.' },
  { kind: 'merchant', title: 'Merchant Report', detail: 'Where the money goes, ranked by total spend.' },
  { kind: 'creditcard', title: 'Credit Card Report', detail: 'Limits, outstanding, utilisation and card-wise spend.' },
  { kind: 'budget', title: 'Budget Report', detail: 'Allocation against actuals with projected finish.' },
];

type Preset = 'this-month' | 'last-month' | 'last-3' | 'this-year' | 'last-year' | 'all' | 'custom';

export function Reports() {
  const { state, toast } = useStore();
  const today = todayISO();
  const month = monthKey(today);
  const [preset, setPreset] = useState<Preset>('this-month');
  const [from, setFrom] = useState(monthRange(month).from);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);

  const range = useMemo(() => {
    switch (preset) {
      case 'this-month': return monthRange(month);
      case 'last-month': return monthRange(addMonthsToKey(month, -1));
      case 'last-3': return { from: `${addMonthsToKey(month, -2)}-01`, to: today };
      case 'this-year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
      case 'last-year': {
        const y = Number(today.slice(0, 4)) - 1;
        return { from: `${y}-01-01`, to: `${y}-12-31` };
      }
      case 'all': return { from: '1970-01-01', to: today };
      default: return { from, to };
    }
  }, [preset, month, today, from, to]);

  const ctx = {
    transactions: state.transactions,
    accounts: state.accounts,
    budgets: state.budgets,
    goals: state.goals,
    range,
    today,
  };

  const count = state.transactions.filter((t) => t.date >= range.from && t.date <= range.to).length;

  const run = async (kind: ReportKind, format: 'pdf' | 'excel' | 'csv') => {
    const key = `${kind}-${format}`;
    setBusy(key);
    try {
      const doc = buildReport(kind, ctx);
      const stem = `${kind}-report-${range.from}-to-${range.to}`;
      if (format === 'csv') await downloadCSV(doc, `${stem}.csv`);
      else if (format === 'excel') await downloadExcel(doc, `${stem}.xlsx`);
      else await downloadPDF(doc, `${stem}.pdf`);
      toast(`${doc.title} exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportLedger = async () => {
    try {
      await downloadBlob(
        new Blob(['\ufeff', transactionsToCSV(state.transactions, state.accounts)], { type: 'text/csv;charset=utf-8' }),
        `finsight-transactions-${today}.csv`,
      );
      toast('Full ledger exported');
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Report period" subtitle={`${count} transactions between ${range.from} and ${range.to}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Preset</span>
            <Select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              options={[
                { value: 'this-month', label: `This month (${monthLabel(month)})` },
                { value: 'last-month', label: `Last month (${monthLabel(addMonthsToKey(month, -1))})` },
                { value: 'last-3', label: 'Last 3 months' },
                { value: 'this-year', label: `This year (${today.slice(0, 4)})` },
                { value: 'last-year', label: `Last year (${Number(today.slice(0, 4)) - 1})` },
                { value: 'all', label: 'All time' },
                { value: 'custom', label: 'Custom range' },
              ]}
            />
          </label>
          <label className={cx('block', preset !== 'custom' && 'opacity-50')}>
            <span className="label">From</span>
            <input type="date" className="input tnum" disabled={preset !== 'custom'} value={preset === 'custom' ? from : range.from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={cx('block', preset !== 'custom' && 'opacity-50')}>
            <span className="label">To</span>
            <input type="date" className="input tnum" disabled={preset !== 'custom'} value={preset === 'custom' ? to : range.to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </Card>

      {inArtifactHost() && (
        <Card dense>
          <p className="text-xs leading-relaxed text-muted">
            <strong className="text-ink">Exports work here.</strong> This preview cannot save files by itself, so
            each download is handed to the page host — you will see a confirmation naming the file before anything
            is saved.
          </p>
        </Card>
      )}

      <Card title="Downloadable reports" subtitle="Excel, PDF or CSV — built from approved transactions only">
        <ul className="space-y-2.5">
          {REPORTS.map((r) => (
            <li key={r.kind} className="rounded-xl border border-line bg-plane p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <IconReport width={15} height={15} className="text-subtle" />
                    {r.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(['excel', 'pdf', 'csv'] as const).map((format) => (
                    <Button
                      key={format}
                      onClick={() => void run(r.kind, format)}
                      disabled={busy !== null}
                      className="!px-2.5 !py-1.5 !text-[11px]"
                    >
                      {busy === `${r.kind}-${format}` ? '…' : format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Raw data export" subtitle="Every transaction as a single flat CSV">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void exportLedger()} disabled={!state.transactions.length}>
            <IconDownload width={16} height={16} /> Export full ledger
          </Button>
          <span className="text-xs text-muted">
            {state.transactions.length} transactions · {formatINR(totalOf(expensesOf(state.transactions)), true)} of recorded spend
          </span>
        </div>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-subtle">
        PDF exports cap very long tables at 400 rows to stay readable; Excel and CSV always carry every
        row. Reports for {monthLabel(month)} cover {daysInMonth(month)} days.
      </p>
    </div>
  );
}
