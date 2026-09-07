import { describe, expect, it } from 'vitest';
import { parseMessage } from './index';
import { extractAmount } from './amount';
import { extractDate } from './date';

const NOW = new Date(2026, 2, 14); // 14 Mar 2026, a Saturday

const parse = (t: string) => parseMessage(t, { now: NOW });

describe('amount extraction', () => {
  it('reads rupee-symbol amounts with Indian grouping', () => {
    expect(extractAmount('Paid ₹1,23,456.78 for something')?.value).toBe(123456.78);
  });

  it('reads Rs./INR prefixes', () => {
    expect(extractAmount('Rs.2,500 spent')?.value).toBe(2500);
    expect(extractAmount('INR 1200 debited')?.value).toBe(1200);
  });

  it('reads suffixed amounts', () => {
    expect(extractAmount('250 rs for tea')?.value).toBe(250);
  });

  it('applies K/lakh/crore multipliers', () => {
    expect(extractAmount('Bought a bike for ₹1.2 lakh')?.value).toBe(120000);
    expect(extractAmount('Paid Rs 25k as advance')?.value).toBe(25000);
    expect(extractAmount('Flat booking ₹1.4 crore')?.value).toBe(14000000);
  });

  it('reads number words', () => {
    expect(extractAmount('paid two thousand five hundred to the plumber')?.value).toBe(2500);
  });

  it('ignores balances, reference numbers and card digits', () => {
    const hit = extractAmount(
      'Rs.450.00 debited from A/c XX4521 on 12-03-26. Avl Bal Rs.28,340.15. Ref 998877665544',
    );
    expect(hit?.value).toBe(450);
  });

  it('ignores OTP digits', () => {
    const hit = extractAmount('Your OTP is 449812 for a txn of Rs.999');
    expect(hit?.value).toBe(999);
  });

  it('returns null when there is no money in the text', () => {
    expect(extractAmount('Meeting rescheduled to Monday')).toBeNull();
  });
});

describe('date extraction', () => {
  it('handles relative words', () => {
    expect(extractDate('spent today', NOW).value).toBe('2026-03-14');
    expect(extractDate('spent yesterday', NOW).value).toBe('2026-03-13');
    expect(extractDate('3 days ago', NOW).value).toBe('2026-03-11');
  });

  it('handles day-first numeric dates', () => {
    expect(extractDate('txn on 05/02/2026', NOW).value).toBe('2026-02-05');
    expect(extractDate('txn on 12-03-26', NOW).value).toBe('2026-03-12');
  });

  it('handles textual dates', () => {
    expect(extractDate('paid on 14 Feb 2026', NOW).value).toBe('2026-02-14');
    expect(extractDate('paid on Jan 3', NOW).value).toBe('2026-01-03');
  });

  it('defaults to today with low confidence when absent', () => {
    const hit = extractDate('paid for lunch', NOW);
    expect(hit.value).toBe('2026-03-14');
    expect(hit.confidence).toBeLessThan(0.5);
  });

  it('rolls a bare future month back to last year', () => {
    expect(extractDate('paid on 20 Dec', NOW).value).toBe('2025-12-20');
  });
});

describe('end-to-end message parsing', () => {
  it('parses the specification example', () => {
    const r = parse('Paid ₹2,500 for fuel through HDFC Credit Card');
    expect(r.kind).toBe('expense');
    expect(r.amount.value).toBe(2500);
    expect(r.category.value).toBe('Fuel');
    expect(r.paymentMode.value).toBe('Credit Card');
    expect(r.bank.value).toBe('HDFC Bank');
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it.each([
    ['Paid ₹250 for lunch', 250, 'Food & Dining'],
    ['Petrol filled for ₹2,000', 2000, 'Fuel'],
    ['Bought groceries worth ₹1,850', 1850, 'Grocery'],
    ['Movie tickets ₹700', 700, 'Movies & Entertainment'],
    ['Paid EMI ₹12,500', 12500, 'EMI/Loans'],
  ])('parses %s', (text, amount, category) => {
    const r = parse(text);
    expect(r.amount.value).toBe(amount);
    expect(r.category.value).toBe(category);
    expect(r.kind).toBe('expense');
    expect(r.isTransaction).toBe(true);
  });

  it('parses a real-shaped bank SMS', () => {
    const r = parse(
      'Rs.1,299.00 debited from A/c XX7788 on 11-03-26 to SWIGGY via UPI Ref 402913887766. Avl Bal Rs.42,118.90 -ICICI Bank',
    );
    expect(r.amount.value).toBe(1299);
    expect(r.date.value).toBe('2026-03-11');
    expect(r.merchant.value).toBe('Swiggy');
    expect(r.category.value).toBe('Food & Dining');
    expect(r.paymentMode.value).toBe('UPI');
    expect(r.bank.value).toBe('ICICI Bank');
    expect(r.last4.value).toBe('7788');
  });

  it('detects income and its category', () => {
    const r = parse('Salary of Rs 95,000 credited to your HDFC account on 01 Mar 2026');
    expect(r.kind).toBe('income');
    expect(r.amount.value).toBe(95000);
    expect(r.category.value).toBe('Salary');
  });

  it('detects a refund as income', () => {
    const r = parse('Refund of ₹1,499 credited for your Amazon order');
    expect(r.kind).toBe('income');
    expect(r.category.value).toBe('Refunds');
  });

  it('keeps an explicit purchase an expense even next to refund wording', () => {
    const r = parse('I paid ₹800 at the store, refund policy is 7 days');
    expect(r.kind).toBe('expense');
  });

  it('never passes off the bank as the merchant', () => {
    const r = parse('Paid ₹2,500 for fuel through HDFC Credit Card');
    expect(r.bank.value).toBe('HDFC Bank');
    expect(r.merchant.value).not.toBe('HDFC Bank');
    expect(r.merchant.value).toBe('Fuel');
  });

  it('recognises wallet and net banking modes', () => {
    expect(parse('Recharged ₹399 using Paytm Wallet').paymentMode.value).toBe('Wallet');
    expect(parse('Sent ₹15,000 via NEFT to landlord').paymentMode.value).toBe('Net Banking');
  });

  it('maps merchants to their category even without keywords', () => {
    const r = parse('₹649 to Netflix');
    expect(r.category.value).toBe('Subscriptions');
    expect(r.subcategory?.value).toBe('OTT');
  });

  it('extracts a location when present', () => {
    expect(parse('Dinner ₹1,200 at a restaurant in Kochi').location.value).toBe('Kochi');
  });

  it('flags OTP and promotional messages as non-transactions', () => {
    expect(parse('Your OTP is 449812. Do not share it with anyone.').isTransaction).toBe(false);
    expect(parse('Flat 50% off! Shop now and win ₹5000 vouchers').isTransaction).toBe(false);
  });

  it('flags a bill reminder as a non-transaction', () => {
    expect(parse('Your credit card bill of Rs.8,400 is due on 25-03-26').isTransaction).toBe(false);
  });

  it('reports low confidence and a null amount when no amount is present', () => {
    const r = parse('had lunch with friends');
    expect(r.amount.value).toBeNull();
    expect(r.confidence).toBeLessThan(0.4);
    expect(r.isTransaction).toBe(false);
  });

  it('always returns human-readable reasoning', () => {
    expect(parse('Paid ₹250 for lunch').reasons.length).toBeGreaterThan(2);
  });

  it('reads a credit card bill payment as a transfer, not new spending', () => {
    const r = parse('Paid credit card bill of ₹18,400 from HDFC via net banking');
    expect(r.category.value).toBe('Transfers');
    expect(r.amount.value).toBe(18400);
  });

  it('still reads a loan EMI as an expense category', () => {
    expect(parse('Paid home loan EMI ₹28,500').category.value).toBe('EMI/Loans');
  });

  it('recognises a user-defined custom category', () => {
    const r = parseMessage('Paid ₹900 for Pet Care today', { now: NOW, extraCategories: ['Pet Care'] });
    expect(r.category.value).toBe('Pet Care');
  });

  it('reads a UPI VPA as the merchant when nothing else matches', () => {
    const r = parse('₹120 paid to ramesh.stores@okaxis via UPI');
    expect(r.merchant.value.toLowerCase()).toContain('ramesh');
    expect(r.paymentMode.value).toBe('UPI');
  });
});
