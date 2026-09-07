/**
 * Chart colour assignment.
 *
 * Slots come from a categorical palette validated for adjacent-pair CVD
 * separation in both light and dark modes. Hues are assigned in fixed order and
 * never cycled: past the eighth series everything folds into a neutral "Other".
 */
export const SERIES_SLOTS = 8;

export function seriesColor(index: number): string {
  if (index >= SERIES_SLOTS) return 'var(--series-other)';
  return `var(--series-${index + 1})`;
}

export const OTHER_COLOR = 'var(--series-other)';

export const SEQUENTIAL = ['var(--seq-100)', 'var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)'];

export const STATUS_COLOR = {
  good: 'rgb(var(--good))',
  warning: 'rgb(var(--warning))',
  serious: 'rgb(var(--serious))',
  critical: 'rgb(var(--critical))',
} as const;

export const INK = {
  primary: 'rgb(var(--ink))',
  muted: 'rgb(var(--ink-muted))',
  subtle: 'rgb(var(--ink-subtle))',
  grid: 'rgb(var(--grid))',
  surface: 'rgb(var(--surface))',
};

export interface NamedValue {
  name: string;
  value: number;
}

/**
 * Keeps the largest `limit` entries and folds the tail into one "Other" row, so
 * a 25-category ledger never asks the palette for a 9th hue.
 */
export function foldToOther(rows: readonly NamedValue[], limit = 7): NamedValue[] {
  if (rows.length <= limit + 1) return [...rows];
  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);
  const other = tail.reduce((acc, r) => acc + r.value, 0);
  return [...head, { name: `Other (${tail.length})`, value: Math.round(other * 100) / 100 }];
}
