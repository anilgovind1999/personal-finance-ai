
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatMoney, formatShortMoney } from '@/lib/utils';
import { INK, foldToOther, seriesColor, type NamedValue } from './palette';
import { cx } from '@/components/ui/Primitives';

const AXIS = { stroke: 'transparent', tick: { fill: INK.subtle, fontSize: 11 }, tickLine: false, axisLine: false } as const;

/** Shared tooltip shell — the chart's own surface, never the browser default. */
function TooltipShell({ title, rows }: { title: string; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="pointer-events-none rounded-xl border border-line bg-raised px-3 py-2 shadow-pop">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          {r.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: r.color }} />}
          <span className="text-muted">{r.label}</span>
          <span className="ml-auto pl-3 font-semibold tnum text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

interface TooltipPayload {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>;
}

function seriesTooltip(labelFor?: (l: string) => string) {
  return function Rendered({ active, label, payload }: TooltipPayload) {
    if (!active || !payload?.length) return null;
    return (
      <TooltipShell
        title={labelFor ? labelFor(String(label ?? '')) : String(label ?? '')}
        rows={payload
          .filter((p) => typeof p.value === 'number')
          .map((p) => ({ label: p.name ?? '', value: formatMoney(p.value as number), color: p.color }))}
      />
    );
  };
}

export interface TrendPoint {
  label: string;
  [key: string]: string | number;
}

/** Income vs expense over time. Two series, one axis, always legended. */
export function TrendChart({
  data, height = 260, series, stacked = false, showLegend = true,
}: {
  data: TrendPoint[];
  height?: number;
  series: Array<{ key: string; name: string; slot: number }>;
  stacked?: boolean;
  showLegend?: boolean;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor(s.slot)} stopOpacity={0.28} />
                <stop offset="100%" stopColor={seriesColor(s.slot)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={54} tickFormatter={(v: number) => formatShortMoney(v)} />
          <Tooltip content={seriesTooltip()} cursor={{ stroke: INK.subtle, strokeWidth: 1, strokeDasharray: '4 4' }} />
          {showLegend && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.muted, paddingTop: 8 }} />}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stackId={stacked ? 'a' : undefined}
              stroke={seriesColor(s.slot)}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: INK.surface }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranked bars — the right form for "which category is biggest". */
export function RankedBars({
  rows, height, valueFormatter = formatMoney, limit = 8, onSelect,
}: {
  rows: readonly NamedValue[];
  height?: number;
  valueFormatter?: (n: number) => string;
  limit?: number;
  onSelect?: (name: string) => void;
}) {
  const data = foldToOther(rows, limit);
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) return <p className="py-6 text-center text-xs text-muted">Nothing to chart yet.</p>;
  return (
    <ul className="space-y-2.5" style={height ? { minHeight: height } : undefined}>
      {data.map((row, i) => (
        <li key={row.name}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(row.name)}
            className={cx('group block w-full text-left', onSelect && 'cursor-pointer')}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-xs font-medium text-ink">{row.name}</span>
              <span className="shrink-0 text-xs font-semibold tnum text-muted">{valueFormatter(row.value)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-line/60">
              <div
                className="h-full rounded-pill transition-[width] duration-500 group-hover:brightness-110"
                style={{ width: `${(row.value / max) * 100}%`, background: seriesColor(i) }}
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Donut for composition. Always paired with a labelled legend list. */
export function DonutChart({
  rows, height = 220, total, centerLabel,
}: {
  rows: readonly NamedValue[];
  height?: number;
  total?: number;
  centerLabel?: string;
}) {
  const data = foldToOther(rows, 7);
  const sum = total ?? data.reduce((a, r) => a + r.value, 0);
  if (!data.length || sum <= 0) return <p className="py-6 text-center text-xs text-muted">Nothing to chart yet.</p>;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div style={{ height, width: height }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="94%"
              paddingAngle={2}
              stroke={INK.surface}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={seriesColor(i)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }: TooltipPayload) =>
                active && payload?.length ? (
                  <TooltipShell
                    title={String(payload[0].payload?.name ?? '')}
                    rows={[
                      { label: 'Amount', value: formatMoney(Number(payload[0].value)) },
                      { label: 'Share', value: `${Math.round((Number(payload[0].value) / sum) * 100)}%` },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-subtle">{centerLabel ?? 'Total'}</span>
          <span className="text-base font-bold tnum text-ink">{formatShortMoney(sum)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((row, i) => (
          <li key={row.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seriesColor(i) }} />
            <span className="truncate text-muted">{row.name}</span>
            <span className="ml-auto shrink-0 font-semibold tnum text-ink">{formatShortMoney(row.value)}</span>
            <span className="w-9 shrink-0 text-right tnum text-subtle">{Math.round((row.value / sum) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical bars for daily/weekly rhythm, with an optional average reference. */
export function ColumnChart({
  data, height = 220, dataKey = 'value', name = 'Spend', slot = 0, average, labelFor,
}: {
  data: Array<Record<string, string | number>>;
  height?: number;
  dataKey?: string;
  name?: string;
  slot?: number;
  average?: number;
  labelFor?: (l: string) => string;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
          <YAxis {...AXIS} width={50} tickFormatter={(v: number) => formatShortMoney(v)} />
          <Tooltip content={seriesTooltip(labelFor)} cursor={{ fill: 'rgb(var(--ink) / 0.04)' }} />
          {average !== undefined && average > 0 && (
            <ReferenceLine
              y={average}
              stroke={INK.subtle}
              strokeDasharray="4 4"
              label={{ value: `avg ${formatShortMoney(average)}`, position: 'insideTopRight', fill: INK.subtle, fontSize: 10 }}
            />
          )}
          <Bar dataKey={dataKey} name={name} fill={seriesColor(slot)} radius={[4, 4, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Actual-then-projected line, with the projection visibly dashed. */
export function ForecastChart({
  data, height = 240,
}: {
  data: Array<{ label: string; actual?: number | null; projected?: number | null }>;
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={54} tickFormatter={(v: number) => formatShortMoney(v)} />
          <Tooltip content={seriesTooltip()} cursor={{ stroke: INK.subtle, strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12, color: INK.muted, paddingTop: 8 }} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke={seriesColor(0)} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          <Line
            type="monotone"
            dataKey="projected"
            name="Projected"
            stroke={seriesColor(1)}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
