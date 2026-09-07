import { describe, expect, it } from 'vitest';
import { parseMessage } from './index';

/**
 * Real-world Indian bank SMS formats.
 *
 * These are modelled on live AU Bank and HDFC Bank alerts, with names, card
 * digits, account numbers and reference numbers replaced — the wording,
 * punctuation, line breaks and field order are what the parser keys off, and
 * those are preserved exactly.
 */

const NOW = new Date(2026, 8, 7); // 7 Sep 2026
const parse = (t: string) => parseMessage(t, { now: NOW });

describe('AU Bank credit card alert', () => {
  const sms =
    'INR 1,970.00 spent at DREAMPLUG TECHNOLOGI on AU Bank Credit Card x3311 06-09-2026 09:59:29 PM. Not you? Call 18001200150 or SMS PBLOCK 3311 to 5676767';
  const r = parse(sms);

  it('reads the amount, ignoring the helpline and block numbers', () => {
    expect(r.amount.value).toBe(1970);
  });

  it('reads the date', () => expect(r.date.value).toBe('2026-09-06'));
  it('reads a single-x card mask', () => expect(r.last4.value).toBe('3311'));
  it('identifies the bank and card type', () => {
    expect(r.bank.value).toBe('AU Small Finance Bank');
    expect(r.paymentMode.value).toBe('Credit Card');
  });
  it('recognises DreamPlug as CRED and treats it as a transfer', () => {
    expect(r.merchant.value).toBe('CRED');
    expect(r.category.value).toBe('Transfers');
  });
});

describe('HDFC card-via-UPI alerts', () => {
  const upiSms = (vpa: string, amount: string, card: string, date: string) =>
    `Txn Rs.${amount}\nOn HDFC Bank Card ${card}\nAt ${vpa}\nby UPI 900044455566\nOn ${date}\nNot You?\nCall 18002586161/SMS BLOCK CC ${card} to 7308080808`;

  it('reads a merchant VPA as the merchant, dropping the payment-gateway token', () => {
    const r = parse(upiSms('dailyobjects.payu@axisban', '698.00', '4422', '07-09'));
    expect(r.amount.value).toBe(698);
    expect(r.merchant.value).toBe('DailyObjects');
    expect(r.category.value).toBe('Shopping');
    expect(r.last4.value).toBe('4422');
  });

  it('resolves a bare day-month date against the current year', () => {
    expect(parse(upiSms('dailyobjects.payu@axisban', '698.00', '4422', '07-09')).date.value).toBe('2026-09-07');
    expect(parse(upiSms('dailyobjects.payu@axisban', '698.00', '4422', '04-09')).date.value).toBe('2026-09-04');
  });

  it('infers a credit card from the block-CC instruction', () => {
    expect(parse(upiSms('dailyobjects.payu@axisban', '698.00', '4422', '07-09')).paymentMode.value).toBe('Credit Card');
  });

  it('refuses to invent a merchant from a numeric QR handle', () => {
    const r = parse(upiSms('q400300200@ybl', '362.00', '5533', '04-09'));
    expect(r.amount.value).toBe(362);
    expect(r.merchant.value).toBe('Unknown merchant');
  });

  it('refuses to invent a merchant from a gpay reference handle', () => {
    expect(parse(upiSms('gpay-99887766554@okbizaxi', '158.00', '5533', '05-09')).merchant.value).toBe('Unknown merchant');
  });
});

describe('HDFC "Spent ... At ..." card alerts', () => {
  const spent = (merchant: string, amount: string, date: string) =>
    `Spent Rs.${amount} On HDFC Bank Card 6644 At ${merchant} On ${date}.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 6644 to 7308080808`;

  it('reads an ALL CAPS merchant name and its category', () => {
    const r = parse(spent('AA FOODS AND BEVERAGES', '70', '2026-09-04:21:39:18'));
    expect(r.amount.value).toBe(70);
    expect(r.date.value).toBe('2026-09-04');
    expect(r.merchant.value).toBe('AA FOODS AND BEVERAGES');
    expect(r.category.value).toBe('Food & Dining');
  });

  it('strips the acquirer prefix from a card descriptor', () => {
    expect(parse(spent('Eas*THEDERMACO', '731.88', '2026-09-06:13:41:04')).merchant.value).toBe('THEDERMACO');
  });

  it('still matches a known merchant inside a truncated legal name', () => {
    const r = parse(spent('Cleartrip Private Limi', '946.28', '2026-09-07:18:10:54'));
    expect(r.merchant.value).toBe('Cleartrip');
    expect(r.category.value).toBe('Travel');
  });

  it('does not mistake the "To Block+Reissue" boilerplate for a payee', () => {
    const r = parse(spent('ARTECH WORLD MALL', '95', '2026-09-04:13:15:23'));
    expect(r.merchant.value).toBe('ARTECH WORLD MALL');
    expect(r.category.value).toBe('Shopping');
  });
});

describe('HDFC UPI "Sent ... From ... To ..." alerts', () => {
  const sent = (payee: string, amount: string, acct: string, date: string) =>
    `Sent Rs.${amount}\nFrom HDFC Bank A/C *${acct}\nTo ${payee}\nOn ${date}\nRef 900011122233\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808`;

  it('names the payee, not the account the money left', () => {
    const r = sent('ARJUN NAIR', '74.00', '7755', '07/09/26');
    const parsed = parse(r);
    expect(parsed.merchant.value).toBe('ARJUN NAIR');
    expect(parsed.bank.value).toBe('HDFC Bank');
  });

  it('reads a single-asterisk account mask', () => {
    expect(parse(sent('ARJUN NAIR', '74.00', '7755', '07/09/26')).last4.value).toBe('7755');
  });

  it('reads the amount and date, ignoring the reference number', () => {
    const r = parse(sent('MEERA IYER', '1000.00', '8866', '04/09/26'));
    expect(r.amount.value).toBe(1000);
    expect(r.date.value).toBe('2026-09-04');
  });

  it('treats a CRED payment as a transfer rather than spending', () => {
    const r = parse(sent('CRED', '495.74', '8866', '04/09/26'));
    expect(r.category.value).toBe('Transfers');
    expect(r.subcategory?.value).toBe('Credit Card Bill Payment');
  });

  it('reads these as outgoing money', () => {
    expect(parse(sent('ARJUN NAIR', '74.00', '7755', '07/09/26')).kind).toBe('expense');
  });
});
