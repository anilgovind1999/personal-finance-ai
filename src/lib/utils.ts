/** Small shared helpers: ids, money formatting, date maths, misc. */

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}_${rand}` : rand;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** ₹1,23,456.78 — Indian digit grouping. */
export function formatINR(n: number, compact = false): string {
  if (!Number.isFinite(n)) return '₹0';
  return (compact ? inrCompactFormatter : inrFormatter).format(n);
}

/** Short form for chart axes and dense cards: ₹1.2L, ₹12.5K, ₹1.4Cr. */
export function formatShortINR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${round2(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${round2(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}₹${round2(abs / 1_000)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

export function formatPercent(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}

/** 'YYYY-MM-DD' for a Date, in local time (never UTC-shifted). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Parses 'YYYY-MM-DD' into a local-midnight Date. */
export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** 'YYYY-MM' month key for a date string. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export function addMonthsToKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Financial-year key for an ISO date, Indian FY starting April. */
export function fyKey(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `FY${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

export function isoWeekKey(iso: string): string {
  const d = fromISODate(iso);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  const week = 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function isWeekend(iso: string): boolean {
  const day = fromISODate(iso).getDay();
  return day === 0 || day === 6;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86400000);
}

export function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

export function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

export function median(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(ns: number[]): number {
  return ns.length ? sum(ns) / ns.length : 0;
}

export function stdev(ns: number[]): number {
  if (ns.length < 2) return 0;
  const m = mean(ns);
  return Math.sqrt(sum(ns.map((n) => (n - m) ** 2)) / (ns.length - 1));
}

/** Ordinary least squares on (index, value) pairs. */
export function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const xs = values.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

/** Levenshtein-based similarity in 0..1, used for fuzzy merchant matching. */
export function similarity(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 1;
  if (!s.length || !t.length) return 0;
  const prev = new Array(t.length + 1).fill(0).map((_, i) => i);
  const cur = new Array(t.length + 1).fill(0);
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= t.length; j++) prev[j] = cur[j];
  }
  return 1 - prev[t.length] / Math.max(s.length, t.length);
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The slice of the Artifact runtime this app uses, when hosted as one. */
interface ClaudeRuntime {
  use(name: 'downloads'): Promise<{ save(r: { filename: string; data: Blob }): Promise<unknown> } | null>;
}

function claudeRuntime(): ClaudeRuntime | null {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

/**
 * Hands a generated file to the user.
 *
 * Normally that is an anchor click. When the app runs inside the Artifact
 * viewer, pages cannot download directly — the host mediates it, showing the
 * viewer a confirmation — so the save goes through that capability instead.
 * A viewer who declines is not an error; anything else is worth surfacing.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const runtime = claudeRuntime();
  if (runtime) {
    const downloads = await runtime.use('downloads').catch(() => null);
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === 'declined' || code === 'rate_limited') return;
        throw new Error(`the viewer could not save the file (${code ?? 'unknown error'})`);
      }
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * True in the hosted single-file preview build, where the sandbox blocks
 * page-initiated downloads and cannot serve the OCR runtime. Used to switch
 * those features off in the UI instead of letting them fail silently.
 */
export const IS_PREVIEW_BUILD = import.meta.env.VITE_PREVIEW === '1';
