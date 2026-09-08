import { describe, expect, it } from 'vitest';
import type { RateTable } from '@/types';
import { convert, describeOriginal, rateFor, ratesAreStale } from './currency';
import { formatMoney, formatShortMoney, setDisplayCurrency } from '@/lib/utils';

// Quoted per 1 INR, as the API returns when asked for an INR base.
const inrTable: RateTable = {
  base: 'INR',
  rates: { INR: 1, USD: 0.012, EUR: 0.011, AED: 0.044, JPY: 1.8 },
  fetchedAt: '2026-09-20T00:00:00.000Z',
  source: 'test',
};

describe('rate lookup', () => {
  it('is 1 for the home currency', () => {
    expect(rateFor('INR', 'INR', inrTable)).toBe(1);
  });

  it('inverts a table quoted in the home currency', () => {
    // 0.012 USD per INR means about 83 INR per USD.
    expect(rateFor('USD', 'INR', inrTable)).toBeCloseTo(83.33, 1);
  });

  it('reads a table quoted in the source currency directly', () => {
    const usdTable: RateTable = { base: 'USD', rates: { INR: 83.5, EUR: 0.92 }, fetchedAt: '', source: 't' };
    expect(rateFor('USD', 'INR', usdTable)).toBe(83.5);
  });

  it('crosses through the base when neither side is it', () => {
    const usdTable: RateTable = { base: 'USD', rates: { INR: 83.5, EUR: 0.92 }, fetchedAt: '', source: 't' };
    // 1 EUR = 83.5/0.92 INR
    expect(rateFor('EUR', 'INR', usdTable)).toBeCloseTo(90.76, 1);
  });

  it('returns null rather than guessing when the rate is unknown', () => {
    expect(rateFor('BRL', 'INR', inrTable)).toBeNull();
    expect(rateFor('USD', 'INR', undefined)).toBeNull();
  });
});

describe('converting an entry', () => {
  it('leaves a home-currency amount alone and records no original', () => {
    const c = convert(1200, 'INR', 'INR', inrTable);
    expect(c.amount).toBe(1200);
    expect(c.rate).toBe(1);
    expect(c.original).toBeUndefined();
  });

  it('converts and keeps the original amount, rate and source', () => {
    const c = convert(50, 'USD', 'INR', inrTable, undefined, '2026-09-20T10:00:00.000Z');
    expect(c.amount).toBeCloseTo(4166.67, 1);
    expect(c.original).toMatchObject({ amount: 50, currency: 'USD', rateSource: 'live' });
    expect(c.original!.rate).toBeCloseTo(83.33, 1);
  });

  it("prefers a rate the user typed — a bank's own rate includes its fees", () => {
    const c = convert(50, 'USD', 'INR', inrTable, 86);
    expect(c.amount).toBe(4300);
    expect(c.original).toMatchObject({ rate: 86, rateSource: 'manual' });
  });

  it('refuses rather than silently treating an unknown rate as 1:1', () => {
    expect(() => convert(50, 'BRL', 'INR', inrTable)).toThrow(/No conversion rate/);
    expect(() => convert(50, 'USD', 'INR', undefined)).toThrow(/No conversion rate/);
  });

  it('rejects a nonsensical typed rate', () => {
    expect(() => convert(50, 'USD', 'INR', inrTable, 0)).toThrow();
    expect(() => convert(50, 'USD', 'INR', inrTable, -3)).toThrow();
  });

  it('a stored transaction does not move when rates later change', () => {
    const atEntry = convert(50, 'USD', 'INR', inrTable);
    const laterTable: RateTable = { ...inrTable, rates: { ...inrTable.rates, USD: 0.009 } };
    // The stored amount is a number, not a formula — the new table cannot touch it.
    const nowWouldBe = convert(50, 'USD', 'INR', laterTable);
    expect(nowWouldBe.amount).not.toBeCloseTo(atEntry.amount, 0);
    expect(atEntry.amount).toBeCloseTo(4166.67, 1);
  });
});

describe('rate freshness', () => {
  it('treats a missing table as stale', () => {
    expect(ratesAreStale(undefined)).toBe(true);
  });

  it('treats rates over a day old as stale', () => {
    const now = new Date('2026-09-22T00:00:00.000Z').getTime();
    expect(ratesAreStale(inrTable, now)).toBe(true);
    expect(ratesAreStale({ ...inrTable, fetchedAt: '2026-09-21T20:00:00.000Z' }, now)).toBe(false);
  });
});

describe('display', () => {
  it('formats in the chosen currency', () => {
    setDisplayCurrency('INR', 'en-IN');
    expect(formatMoney(1234.5)).toContain('1,234.5');
    setDisplayCurrency('USD', 'en-US');
    expect(formatMoney(1234.5)).toContain('$');
    setDisplayCurrency('INR', 'en-IN');
  });

  it('uses lakh and crore only for rupees', () => {
    setDisplayCurrency('INR', 'en-IN');
    expect(formatShortMoney(250000)).toContain('L');
    setDisplayCurrency('USD', 'en-US');
    expect(formatShortMoney(2500000)).toContain('M');
    setDisplayCurrency('INR', 'en-IN');
  });

  it('explains a foreign entry in words', () => {
    const c = convert(50, 'USD', 'INR', inrTable, 86);
    expect(describeOriginal(c.original!, 'INR')).toBe('$50.00 USD at ₹86 per USD');
  });
});
