import { describe, expect, it } from 'vitest';
import { extractReceiptFields, extractionFromReceipt } from './receipt';

const RECEIPT = `
BIG BAZAAR RETAIL LTD
Shop 14, MG Road, Kochi
GSTIN: 32AABCU9603R1ZM
Invoice No: INV/2026/00842
Date: 08/03/2026

Toor Dal 1kg           180.00
Sunflower Oil 1L       210.50
Basmati Rice 5kg       620.00
Detergent Powder       249.00

Sub Total             1259.50
CGST @2.5%              31.49
SGST @2.5%              31.49
Grand Total           1322.48
Paid by UPI
`;

describe('receipt OCR extraction', () => {
  const fields = extractReceiptFields(RECEIPT);

  it('reads the grand total rather than the sub total', () => {
    expect(fields.total).toBe(1322.48);
    expect(fields.subtotal).toBe(1259.5);
  });

  it('sums split CGST and SGST into one GST figure', () => {
    expect(fields.gst).toBe(62.98);
  });

  it('reads the GSTIN and invoice number', () => {
    expect(fields.gstin).toBe('32AABCU9603R1ZM');
    expect(fields.invoiceNo).toBe('INV/2026/00842');
  });

  it('reads the bill date', () => {
    expect(fields.date).toBe('2026-03-08');
  });

  it('reads the merchant from the header', () => {
    expect(fields.merchant).toMatch(/BIG BAZAAR/i);
  });

  it('collects the line items', () => {
    expect(fields.lineItems.length).toBe(4);
    expect(fields.lineItems[0]).toEqual({ description: 'Toor Dal 1kg', amount: 180 });
  });

  it('produces an approval-ready extraction', () => {
    const r = extractionFromReceipt(RECEIPT);
    expect(r.kind).toBe('expense');
    expect(r.amount.value).toBe(1322.48);
    expect(r.date.value).toBe('2026-03-08');
    expect(r.paymentMode.value).toBe('UPI');
    expect(r.isTransaction).toBe(true);
  });

  it('categorises a supermarket receipt from its item names', () => {
    const r = extractionFromReceipt(RECEIPT);
    expect(r.category.value).toBe('Grocery');
    expect(r.merchant.value).toMatch(/big bazaar/i);
  });

  it('falls back to the largest amount when no total line is printed', () => {
    const f = extractReceiptFields('CHAI POINT\nTea 40.00\nSamosa 25.00\n65.00');
    expect(f.total).toBe(65);
  });

  it('handles a single-line GST receipt', () => {
    const f = extractReceiptFields('CAFE NOIR\nBill Amount: 472.00\nGST 18%: 72.00');
    expect(f.total).toBe(472);
    expect(f.gst).toBe(72);
  });
});
