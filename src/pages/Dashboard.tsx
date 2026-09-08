import { useMemo } from 'react';
import type { Route } from '@/components/Shell';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, EmptyState, Progress, cx } from '@/components/ui/Primitives';
import { KpiCard } from '@/components/KpiCard';
import { DonutChart, ForecastChart, RankedBars, TrendChart } from '@/components/charts/Charts';
import {
  IconAlert, IconChart, IconInbox, IconInfo, IconShield, IconSparkles, IconTrendUp, IconWallet,
} from '@/components/Icons';
import {
  byCategory, byPaymentMode, cashBalance, creditOutstanding, deltaPercent, monthRange,
  monthlySeries, summarise,
} from '@/engine/analytics';
import { budgetAlerts, evaluateAll } from '@/engine/budget';
import { forecastMonthEnd } from '@/engine/forecast';
import { generateInsights, type InsightSeverity } from '@/engine/insights';
import { financialHealth } from '@/engine/health';
import { buildDemoState, DEMO_MESSAGES } from '@/store/demoData';
import { isOwner } from '@/sync/admin';
import { addMonthsToKey, formatMoney, formatShortMoney, monthKey, monthLabel, todayISO } from '@/lib/utils';

export function Dashboard({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state, dispatch, captureText, cloud, toast } = useStore();
  // Nine months of invented history helps whoever is demonstrating the app and
  // nobody who is tracking real money, so it is offered only to its owner.
  const owner = isOwner(cloud.account, cloud.configured);
  const today = todayISO();
  const month = monthKey(today);
  const pendingCount = state.pending.filter((p) => p.status === 'pending').length;

  const view = useMemo(() => {
    const txns = state.transactions;
    const thisMonth = summarise(txns, monthRange(month));
    const lastMonth = summarise(txns, monthRange(addMonthsToKey(month, -1)));
    const series = monthlySeries(txns, 12).map((b) => ({
      label: monthLabel(b.key),
      Income: b.income,
      Expenses: b.expense,
    }));
    const statuses = evaluateAll(state.budgets, txns, today, state.settings.alertThresholds);
    const overall = statuses.find((s) => s.budget.category === 'ALL' && s.budget.period === 'monthly');
    return {
      thisMonth,
      lastMonth,
      series,
      statuses,
      overall,
      alerts: budgetAlerts(statuses).slice(0, 4),
      forecast: forecastMonthEnd(txns, today),
      insights: generateInsights(txns, state.accounts, today).slice(0, 6),
      health: financialHealth(txns, state.accounts, state.budgets, state.goals, today),
      cash: cashBalance(state.accounts, txns),
      credit: creditOutstanding(state.accounts, txns),
      categories: byCategory(txns.filter((t) => t.date >= monthRange(month).from)),
      modes: byPaymentMode(txns.filter((t) => t.date >= monthRange(month).from)),
    };
  }, [state.transactions, state.accounts, state.budgets, state.goals, state.settings.alertThresholds, month, today]);

  const loadDemo = () => {
    const demo = buildDemoState(today);
    dispatch({ type: 'replaceAll', state: demo });
    // Queue the sample messages through the real AI engine, so the approval
    // screen shows genuine extractions rather than canned rows.
    setTimeout(() => {
      const d1 = addMonthsToKey(month, 0);
      for (const m of DEMO_MESSAGES) {
        captureText(m.text.replace('{d1}', `${d1}-05`).replace('{d2}', `${d1}-06`), m.source);
      }
      toast('Sample data loaded — 9 months of history and 5 messages to review');
    }, 60);
  };

  if (!state.transactions.length) {
    return (
      <div className="space-y-4">
        <Card>
          <EmptyState
            icon={<IconSparkles width={32} height={32} />}
            title="Welcome to FinSight"
            detail="Capture expenses by hand or let the AI read your bank messages and receipts. Everything it finds waits in Pending Approval until you confirm it — nothing reaches your ledger unreviewed."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="primary" onClick={() => onNavigate('capture')}>
                  <IconSparkles width={16} height={16} /> Paste a bank message
                </Button>
                <Button onClick={() => dispatch({ type: 'settings/update', settings: { onboarded: false } })}>
                  Take the tour
                </Button>
                {owner && <Button onClick={loadDemo}>Load sample data</Button>}
              </div>
            }
          />
        </Card>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { title: 'Capture', body: 'Type a message, paste an SMS, or scan a receipt. The engine reads the amount, merchant, category, payment mode and bank.' },
            { title: 'Approve', body: 'Every AI-detected entry lands in a review queue. Approve, edit and approve, or reject — your call, always.' },
            { title: 'Understand', body: 'Dashboards, budgets, forecasts and plain-language insights built from the transactions you approved.' },
          ].map((s, i) => (
            <Card key={s.title} className="!bg-plane">
              <p className="mb-1 text-xs font-bold text-accent">STEP {i + 1}</p>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const { thisMonth, lastMonth, forecast, health, overall } = view;
  const expenseDelta = deltaPercent(lastMonth.expense, thisMonth.expense);
  const incomeDelta = deltaPercent(lastMonth.income, thisMonth.income);

  return (
    <div className="space-y-4">
      {state.settings.demoLoadedAt && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-warning/40 bg-warning/10 px-4 py-3">
          <IconInfo width={18} height={18} className="shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-semibold">This is sample data.</span>{' '}
            <span className="text-muted">Invented figures for trying the app out — none of it is yours.</span>
          </p>
          <Button
            onClick={() => {
              dispatch({ type: 'data/clearSample' });
              toast('Sample data cleared — the ledger is empty and ready for your own entries');
            }}
          >
            Clear it
          </Button>
        </div>
      )}

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('approvals')}
          className="flex w-full items-center gap-3 rounded-card border border-accent/40 bg-accent/10 px-4 py-3 text-left transition-colors hover:bg-accent/15"
        >
          <IconInbox width={20} height={20} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {pendingCount} transaction{pendingCount === 1 ? '' : 's'} waiting for your approval
            </p>
            <p className="text-xs text-muted">Nothing has been added to your ledger yet.</p>
          </div>
          <span className="text-xs font-bold text-accent">Review →</span>
        </button>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total income"
          value={formatMoney(thisMonth.income, true)}
          delta={incomeDelta}
          deltaLabel="vs last month"
          icon={<IconTrendUp width={14} height={14} />}
        />
        <KpiCard
          label="Total expenses"
          value={formatMoney(thisMonth.expense, true)}
          delta={expenseDelta}
          deltaLabel="vs last month"
          deltaGoodWhen="down"
          icon={<IconChart width={14} height={14} />}
        />
        <KpiCard
          label="Net savings"
          value={formatMoney(thisMonth.net, true)}
          hint={`${thisMonth.savingsRate}% of income kept`}
          icon={<IconWallet width={14} height={14} />}
        />
        <KpiCard
          label="Savings rate"
          value={`${thisMonth.savingsRate}%`}
          tone={thisMonth.savingsRate >= 30 ? 'good' : thisMonth.savingsRate >= 15 ? 'warning' : 'critical'}
          status={thisMonth.savingsRate >= 30 ? 'Strong' : thisMonth.savingsRate >= 15 ? 'Fair' : 'Low'}
          hint={`${formatMoney(thisMonth.net, true)} kept from ${formatMoney(thisMonth.income, true)}`}
        />
        <KpiCard label="Cash balance" value={formatMoney(view.cash, true)} hint="Across savings, cash and wallets" />
        <KpiCard
          label="Card outstanding"
          value={formatMoney(view.credit, true)}
          status={view.credit > 0 ? 'Due' : 'Clear'}
          tone={view.credit > 0 ? 'warning' : 'good'}
          hint={view.credit > 0 ? 'Unsettled credit card spend' : 'Every card is settled'}
        />
        <KpiCard
          label="Budget remaining"
          value={overall ? formatMoney(Math.max(0, overall.remaining), true) : '—'}
          hint={overall ? `${overall.utilisation}% of ${formatShortMoney(overall.allocated)} used` : 'No monthly budget set'}
          onClick={() => onNavigate('budgets')}
          footer={overall ? (
            <Progress
              value={overall.utilisation}
              tone={overall.status === 'exceeded' ? 'critical' : overall.status === 'critical' ? 'serious' : overall.status === 'warning' ? 'warning' : 'good'}
            />
          ) : undefined}
        />
        <KpiCard
          label="Health score"
          value={`${health.score}/100`}
          tone={health.score >= 70 ? 'good' : health.score >= 55 ? 'warning' : 'critical'}
          status={health.grade}
          onClick={() => onNavigate('analytics')}
          footer={<Progress value={health.score} tone={health.score >= 70 ? 'good' : health.score >= 55 ? 'warning' : 'critical'} />}
        />
      </section>

      {view.alerts.length > 0 && (
        <Card title="Budget alerts" subtitle={`Thresholds at ${state.settings.alertThresholds.join('%, ')}%`} dense>
          <ul className="space-y-2">
            {view.alerts.map((a) => (
              <li
                key={a.id}
                className={cx(
                  'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs',
                  a.severity === 'exceeded' ? 'border-critical/35 bg-critical/10'
                    : a.severity === 'critical' ? 'border-serious/35 bg-serious/10'
                    : 'border-warning/35 bg-warning/10',
                )}
              >
                <IconAlert
                  width={15} height={15}
                  className={cx('mt-0.5 shrink-0', a.severity === 'exceeded' ? 'text-critical' : a.severity === 'critical' ? 'text-serious' : 'text-warning')}
                />
                <span className="text-ink">{a.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Income vs expenses"
          subtitle="Last 12 months, approved transactions only"
        >
          <TrendChart
            data={view.series}
            series={[{ key: 'Income', name: 'Income', slot: 2 }, { key: 'Expenses', name: 'Expenses', slot: 1 }]}
          />
        </Card>

        <Card title="Month-end forecast" subtitle={forecast.method}>
          <div className="mb-3">
            <p className="text-2xl font-bold tnum">{formatMoney(forecast.projectedTotal, true)}</p>
            <p className="mt-1 text-xs text-muted">
              {formatMoney(forecast.actualToDate, true)} spent over {forecast.daysElapsed} of {forecast.daysTotal} days
              {forecast.projectedRemaining > 0 && <> · {formatMoney(forecast.projectedRemaining, true)} more expected</>}
            </p>
            <Badge tone={forecast.confidence >= 0.7 ? 'good' : 'warning'} className="mt-2">
              {Math.round(forecast.confidence * 100)}% confidence
            </Badge>
          </div>
          <ForecastChart
            height={170}
            data={[
              ...monthlySeries(state.transactions, 6)
                .filter((b) => b.key < month)
                .map((b) => ({ label: monthLabel(b.key), actual: b.expense, projected: null })),
              { label: monthLabel(month), actual: forecast.actualToDate, projected: forecast.actualToDate },
              { label: 'Projected', actual: null, projected: forecast.projectedTotal },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Where the money went" subtitle={`Category split for ${monthLabel(month)}`}>
          <DonutChart rows={view.categories} centerLabel="Spent" />
        </Card>
        <Card title="How you paid" subtitle={`Payment modes for ${monthLabel(month)}`}>
          <RankedBars rows={view.modes} limit={6} />
        </Card>
      </div>

      <Card
        title="Financial intelligence"
        subtitle={health.summary}
        action={<Button variant="quiet" onClick={() => onNavigate('analytics')}>See all</Button>}
      >
        {view.insights.length ? (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {view.insights.map((i) => (
              <li key={i.id} className="rounded-xl border border-line bg-plane p-3">
                <div className="mb-1 flex items-center gap-2">
                  <SeverityDot severity={i.severity} />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-subtle">{i.tag}</span>
                </div>
                <p className="text-xs font-semibold leading-snug text-ink">{i.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{i.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<IconInfo width={26} height={26} />} title="Not enough history yet" detail="Insights sharpen once you have a couple of months of approved transactions." />
        )}
      </Card>

      <Card title="Financial health breakdown" subtitle={`${health.score}/100 · ${health.grade}`}>
        <ul className="space-y-3">
          {health.components.map((c) => (
            <li key={c.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <IconShield width={13} height={13} className="text-subtle" />
                  {c.label}
                  <span className="font-normal text-subtle">· {c.weight}% weight</span>
                </span>
                <span className="shrink-0 text-xs font-bold tnum">{c.score}</span>
              </div>
              <Progress value={c.score} tone={c.score >= 70 ? 'good' : c.score >= 45 ? 'warning' : 'critical'} />
              <p className="mt-1 text-[11px] text-muted">{c.detail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function SeverityDot({ severity }: { severity: InsightSeverity }) {
  const map: Record<InsightSeverity, string> = {
    positive: 'bg-good', neutral: 'bg-accent', warning: 'bg-warning', critical: 'bg-critical',
  };
  return <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', map[severity])} aria-hidden="true" />;
}
