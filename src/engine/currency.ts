import type { OriginalAmount, RateTable } from '@/types';
import { currency, DEFAULT_CURRENCY } from '@/data/currencies';
import { round2 } from '@/lib/utils';

/**
 * Currency conversion.
 *
 * The rule the whole app rests on: a transaction's `amount` is always in the
 * home currency, converted once at entry time and never recomputed. A rate that
 * moves tomorrow must not change what a purchase cost last March — a ledger
 * that rewrites its own history is not a ledger.
 */

/** Free, key-less endpoint. Only ever called when the user opts in. */
const RATES_ENDPOINT = 'https://open.er-api.com/v6/latest/';
export const RATES_HOST = 'https://open.er-api.com';

/** Rates older than this are worth refreshing, but still usable. */
const STALE_AFTER_HOURS = 24;

export interface Conversion {
  /** The amount in the home currency. */
  amount: number;
  rate: number;
  original?: OriginalAmount;
}

/**
 * Converts an amount into the home currency.
 *
 * `explicitRate` wins over the table — a bank statement's own rate, including
 * its fees, is truer than a mid-market quote.
 */
export function convert(
  amount: number,
  from: string,
  home: string,
  table: RateTable | undefined,
  explicitRate?: number,
  now = new Date().toISOString(),
): Conversion {
  if (from === home) {
    return { amount: round2(amount), rate: 1 };
  }

  const rate = explicitRate ?? rateFor(from, home, table);
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    // Without a rate the honest thing is to refuse, not to guess at 1:1.
    throw new Error(`No conversion rate available for ${from} to ${home}.`);
  }

  return {
    amount: round2(amount * rate),
    rate,
    original: {
      amount: round2(amount),
      currency: from,
      rate,
      rateAt: now,
      rateSource: explicitRate ? 'manual' : 'live',
    },
  };
}

/**
 * Units of `home` per one unit of `from`.
 *
 * The table is quoted per one unit of its own base, so a table based on
 * something other than the home currency is crossed through the base.
 */
export function rateFor(from: string, home: string, table: RateTable | undefined): number | null {
  if (from === home) return 1;
  if (!table) return null;

  const perBase = table.rates;
  if (table.base === home) {
    // rates[from] is 'from' per 1 home, so invert it.
    const v = perBase[from];
    return v && v > 0 ? 1 / v : null;
  }
  if (table.base === from) {
    const v = perBase[home];
    return v && v > 0 ? v : null;
  }

  const fromPerBase = perBase[from];
  const homePerBase = perBase[home];
  if (!fromPerBase || !homePerBase || fromPerBase <= 0) return null;
  return homePerBase / fromPerBase;
}

export function ratesAreStale(table: RateTable | undefined, now = Date.now()): boolean {
  if (!table) return true;
  return now - new Date(table.fetchedAt).getTime() > STALE_AFTER_HOURS * 3600 * 1000;
}

export interface FetchResult {
  table?: RateTable;
  error?: string;
}

/**
 * Fetches current rates. Never called unless the user has switched live rates
 * on — the app makes no network requests otherwise, and that is a promise worth
 * keeping.
 */
export async function fetchRates(base = DEFAULT_CURRENCY, signal?: AbortSignal): Promise<FetchResult> {
  try {
    const res = await fetch(`${RATES_ENDPOINT}${encodeURIComponent(base)}`, {
      signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { error: `Rate service returned ${res.status}.` };

    const body: unknown = await res.json();
    const data = body as { result?: string; rates?: Record<string, number>; base_code?: string };
    if (data.result && data.result !== 'success') return { error: 'Rate service reported a failure.' };
    if (!data.rates || typeof data.rates !== 'object') return { error: 'Rate service returned no rates.' };

    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(data.rates)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) rates[code] = value;
    }
    if (!Object.keys(rates).length) return { error: 'Rate service returned no usable rates.' };

    return {
      table: {
        base: data.base_code ?? base,
        rates,
        fetchedAt: new Date().toISOString(),
        source: 'open.er-api.com',
      },
    };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return { error: 'Cancelled.' };
    return { error: 'Could not reach the rate service. Rates you already have still work.' };
  }
}

/** "US$ 42.00 at ₹83.21" — how a foreign entry reads back to its owner. */
export function describeOriginal(original: OriginalAmount, home: string): string {
  const from = currency(original.currency);
  const to = currency(home);
  const amount = original.amount.toFixed(from.digits);
  return `${from.symbol}${amount} ${from.code} at ${to.symbol}${round2(original.rate)} per ${from.code}`;
}
