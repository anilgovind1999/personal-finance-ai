import { useMemo, useState } from 'react';
import { useStore } from '@/store/AppStore';
import { Badge, Card, EmptyState, Progress, Segmented, cx } from '@/components/ui/Primitives';
import { ColumnChart, DonutChart, ForecastChart, RankedBars, TrendChart } from '@/components/charts/Charts';
import { IconChart, IconInfo } from '@/components/Icons';
import {
  byAccount, byBank, byCard, byCategory, byMerchant, byPaymentMode, bySubcategory, byTag,
  dailySeries, monthRange, monthlySeries, summarise, weekdayVsWeekend, weeklySeries, yearlySeries,
} from '@/engine/analytics';
import { fixedVsVariable, generateInsights, type InsightSeverity } from '@/engine/insights';
import { incomeVolatility, summariseIncome } from '@/engine/income';
import { forecastMonthEnd, forecastYearEnd, projectCashBalance, savingsPotential } from '@/engine/forecast';
import { addMonthsToKey, formatMoney, formatShortMoney, monthKey, monthLabel, todayISO } from '@/lib/utils';

type Period = '1m' | '3m' | '6m' | '12m' | 'all';
type Grain = 'daily' | 'weekly' | 'monthly' | 'yearly';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '1m', label: '1M' }, { value: '3m', label: '3M' },
  { value: '6m', label: '6M' }, { value: '12m', label: '1Y' }, { value: 'all', label: 'All' },
];

export function Analytics() {
  const { state } = useStore();
  const today = todayISO();
  const month = monthKey(today);
  const [period, setPeriod] = useState<Period>('3m');
  const [grain, setGrain] = useState<Grain>('monthly');

  const from = useMemo(() => {
    if (period === 'all') return '0000-01-01';
    const months = { '1m': 0, '3m': 2, '6m': 5, '12m': 11 }[period];
    return `${addMonthsToKey(month, -months)}-01`;
  }, [period, month]);

  const scoped = useMemo(
    () => state.transactions.filter((t) => t.date >= from && t.date <= today),
    [state.transactions, from, today],
  );

  const view = useMemo(() => {
    const trend =
      grain === 'daily' ? dailySeries(scoped, { from, to: today }).map((b) => ({ label: b.key.slice(5), Expenses: b.expense, Income: b.income }))
      : grain === 'weekly' ? weeklySeries(scoped).map((b) => ({ label: b.key.slice(5), Expenses: b.expense, Income: b.income }))
      : grain === 'yearly' ? yearlySeries(scoped).map((b) => ({ label: b.key, Expenses: b.expense, Income: b.income }))
      : monthlySeries(scoped).map((b) => ({ label: monthLabel(b.key), Expenses: b.expense, Income: b.income }));

    return {
      summary: summarise(scoped),
      trend,
      categories: byCategory(scoped),
      subcategories: bySubcategory(scoped),
      merchants: byMerchant(scoped),
      modes: byPaymentMode(scoped),
      accounts: byAccount(scoped, state.accounts),
      banks: byBank(scoped, state.accounts),
      cards: byCard(scoped, state.accounts),
      tags: byTag(scoped),
      weekday: weekdayVsWeekend(scoped),
      fixed: fixedVsVariable(scoped),
      insights: generateInsights(state.transactions, state.accounts, today),
      monthEnd: forecastMonthEnd(state.transactions, today),
      yearEnd: forecastYearEnd(state.transactions, today),
      cashPath: projectCashBalance(state.accounts, state.transactions, 6, today),
      potential: savingsPotential(state.transactions, today),
      thisMonthDaily: dailySeries(state.transactions, monthRange(month)).map((b) => ({ label: b.key.slice(8), value: b.expense })),
      income: summariseIncome(state.transactions, today),
    };
  }, [scoped, grain, from, today, state.transactions, state.accounts, month]);

  if (!state.transactions.length) {
    return (
      <Card>
        <EmptyState icon={<IconChart width={30} height={30} />} title="No analytics yet" detail="Approve some transactions and this page fills with trends, forecasts and insights." />
      </Card>
    );
  }

  const avgDaily = view.thisMonthDaily.length
    ? view.thisMonthDaily.reduce((a, d) => a + d.value, 0) / view.thisMonthDaily.length
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={period} onChange={setPeriod} options={PERIODS} />
        <Segmented
          value={grain}
          onChange={setGrain}
          options={[
            { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income" value={formatMoney(view.summary.income, true)} />
        <Stat label="Expenses" value={formatMoney(view.summary.expense, true)} />
        <Stat label="Invested" value={formatMoney(view.summary.invested, true)} hint="Counted as savings" />
        <Stat label="Avg / day" value={formatMoney(view.summary.avgDaily, true)} />
      </div>

      <Card title={`${grain[0].toUpperCase()}${grain.slice(1)} trend`} subtitle="Income against expenses over the selected window">
        <TrendChart
          data={view.trend}
          series={[{ key: 'Income', name: 'Income', slot: 2 }, { key: 'Expenses', name: 'Expenses', slot: 1 }]}
        />
      </Card>

      <Card title="Daily rhythm this month" subtitle={`Average ${formatMoney(avgDaily)} a day`}>
        <ColumnChart data={view.thisMonthDaily} average={avgDaily} slot={1} labelFor={(d) => `${d} ${monthLabel(month)}`} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Category-wise spend" subtitle={`${view.categories.length} categories in range`}>
          <DonutChart rows={view.categories} />
        </Card>
        <Card title="Subcategory analysis" subtitle="Where the detail sits">
          <RankedBars rows={view.subcategories} limit={9} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payment mode analysis" subtitle="UPI, cards, cash and the rest">
          <RankedBars rows={view.modes} limit={6} />
          <ul className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
            {view.modes.slice(0, 4).map((m) => (
              <li key={m.name} className="rounded-lg bg-plane px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{m.name}</p>
                <p className="text-sm font-bold tnum">{m.share}%</p>
                <p className="text-[11px] text-muted">{m.count} transactions</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Bank & card analysis" subtitle="Which account carries the spend">
          {view.accounts.length ? (
            <>
              <RankedBars rows={view.banks} limit={6} />
              {view.cards.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">Card-wise spending</p>
                  <RankedBars rows={view.cards} limit={5} />
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                Most used account: <strong className="text-ink">{view.accounts[0]?.name}</strong> · {formatMoney(view.accounts[0]?.value ?? 0)}
              </p>
            </>
          ) : (
            <EmptyState title="No accounts linked" detail="Link transactions to accounts to see this breakdown." />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top merchants" subtitle="Where the money actually goes">
          <RankedBars rows={view.merchants} limit={10} />
        </Card>

        <Card title="Spending shape">
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs font-semibold">Fixed commitments</span>
                <span className="text-xs font-bold tnum">{view.fixed.fixedShare}%</span>
              </div>
              <Progress value={view.fixed.fixedShare} tone={view.fixed.fixedShare > 70 ? 'warning' : 'accent'} />
              <p className="mt-1 text-[11px] text-muted">
                {formatMoney(view.fixed.fixed, true)} fixed · {formatMoney(view.fixed.variable, true)} variable
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-plane p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">Weekday / day</p>
                <p className="text-sm font-bold tnum">{formatMoney(view.weekday.weekdayAvg, true)}</p>
              </div>
              <div className="rounded-xl bg-plane p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">Weekend / day</p>
                <p className="text-sm font-bold tnum">{formatMoney(view.weekday.weekendAvg, true)}</p>
              </div>
            </div>
            <p className="text-xs text-muted">
              {view.weekday.liftPercent >= 0
                ? `Weekend days cost ${Math.round(view.weekday.liftPercent)}% more than weekdays.`
                : `Weekdays cost ${Math.round(Math.abs(view.weekday.liftPercent))}% more than weekends.`}
            </p>

            {view.tags.length > 0 && (
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">By tag</p>
                <RankedBars rows={view.tags} limit={5} />
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Income"
        subtitle="What comes in, and how much of it you can count on"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="This month" value={formatMoney(view.income.thisMonth, true)} />
          <Stat label={`${today.slice(0, 4)} so far`} value={formatMoney(view.income.thisYear, true)} />
          <Stat
            label="Monthly average"
            value={formatMoney(view.income.monthlyAverage, true)}
            hint={`${formatMoney(view.income.annualisedRunRate, true)} a year at this rate`}
          />
          <Stat
            label="Dependable"
            value={`${view.income.stabilityPercent}%`}
            hint={`${formatMoney(view.income.recurringMonthly, true)} recurring`}
          />
        </div>

        {view.income.monthlyAverage > 0 && (
          <>
            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold">Recurring vs variable</span>
                <span className="text-xs text-muted">
                  {formatMoney(view.income.recurringMonthly, true)} recurring ·{' '}
                  {formatMoney(view.income.variableMonthly, true)} variable
                </span>
              </div>
              <Progress
                value={view.income.stabilityPercent}
                tone={view.income.stabilityPercent >= 70 ? 'good' : view.income.stabilityPercent >= 40 ? 'warning' : 'critical'}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {view.income.stabilityPercent >= 70
                  ? 'Most of your income arrives predictably, which makes budgeting straightforward.'
                  : view.income.stabilityPercent >= 40
                    ? 'A meaningful share of your income is variable — worth budgeting against the recurring part alone.'
                    : 'Most of your income is irregular. Budget against the dependable figure and treat the rest as upside.'}
                {' '}Month-to-month swing: {incomeVolatility(view.income)}%.
              </p>
            </div>

            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">Income sources</p>
              <ul className="space-y-2">
                {view.income.sources.slice(0, 8).map((src) => (
                  <li key={`${src.name}-${src.category}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-plane px-2.5 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink">{src.name}</span>
                      <span className="block truncate text-[11px] text-muted">{src.category} · {src.reason}</span>
                    </span>
                    <Badge tone={src.recurring ? 'good' : 'neutral'}>{src.recurring ? 'Recurring' : 'Variable'}</Badge>
                    <span className="shrink-0 text-xs font-bold tnum">{formatMoney(src.total, true)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Card>

      <Card title="Forecasts" subtitle="Built from your own history, not a generic model">
        <div className="grid gap-3 sm:grid-cols-3">
          <Forecast
            label="Month-end expenses"
            value={formatMoney(view.monthEnd.projectedTotal, true)}
            detail={`${formatMoney(view.monthEnd.actualToDate, true)} so far · ${Math.round(view.monthEnd.confidence * 100)}% confidence`}
          />
          <Forecast
            label="Year-end expenses"
            value={formatMoney(view.yearEnd.projectedExpense, true)}
            detail={`${view.yearEnd.monthsRemaining} months left in ${view.yearEnd.year}`}
          />
          <Forecast
            label="Year-end savings"
            value={formatMoney(view.yearEnd.projectedSavings, true)}
            detail={`On ${formatMoney(view.yearEnd.projectedIncome, true)} projected income`}
          />
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">Projected cash balance</p>
          <ForecastChart
            height={200}
            data={[
              ...monthlySeries(state.transactions, 6).map((b) => ({ label: monthLabel(b.key), actual: b.net, projected: null })),
              ...view.cashPath.map((p, i) => ({
                label: monthLabel(p.month),
                actual: null,
                projected: i === 0 ? p.closingBalance : p.closingBalance,
              })),
            ]}
          />
          <p className="mt-1 text-[11px] text-muted">
            Actual line shows monthly net; the dashed line rolls your cash balance forward at typical income and spend.
          </p>
        </div>

        {view.potential.opportunities.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-subtle">Saving potential this month</p>
            <ul className="space-y-1.5">
              {view.potential.opportunities.slice(0, 5).map((o) => (
                <li key={o.category} className="flex items-center gap-2 text-xs">
                  <span className="truncate text-muted">{o.category}</span>
                  <span className="ml-auto shrink-0 text-subtle tnum">usual {formatShortMoney(o.typical)}</span>
                  <span className="shrink-0 font-bold tnum text-warning">+{formatShortMoney(o.saving)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              Bringing these back to their usual level would free up about{' '}
              <strong className="text-ink">{formatMoney(view.potential.opportunities.reduce((a, o) => a + o.saving, 0), true)}</strong>.
            </p>
          </div>
        )}
      </Card>

      <Card title="Financial intelligence" subtitle={`${view.insights.length} observations from your ledger`}>
        {view.insights.length ? (
          <ul className="space-y-2.5">
            {view.insights.map((i) => (
              <li key={i.id} className={cx('rounded-xl border-l-4 border border-line bg-plane p-3', borderFor(i.severity))}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={toneFor(i.severity)}>{i.tag}</Badge>
                  {i.impact ? <span className="text-[11px] font-semibold tnum text-subtle">{formatMoney(i.impact, true)}</span> : null}
                </div>
                <p className="text-sm font-semibold leading-snug text-ink">{i.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{i.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<IconInfo width={26} height={26} />} title="Nothing to report yet" />
        )}
      </Card>
    </div>
  );
}

function borderFor(s: InsightSeverity): string {
  return { positive: 'border-l-good', neutral: 'border-l-accent', warning: 'border-l-warning', critical: 'border-l-critical' }[s];
}
function toneFor(s: InsightSeverity) {
  return ({ positive: 'good', neutral: 'accent', warning: 'warning', critical: 'critical' } as const)[s];
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card card-pad">
      <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-lg font-bold tnum">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Forecast({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-line bg-plane p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-lg font-bold tnum text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{detail}</p>
    </div>
  );
}
