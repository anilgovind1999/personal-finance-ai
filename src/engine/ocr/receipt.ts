import type { ExtractionResult } from '@/types';
import { parseMessage, type ParseOptions } from '@/engine/parser';
import { extractDate } from '@/engine/parser/date';
import { round2 } from '@/lib/utils';

export interface ReceiptFields {
  merchant: string | null;
  date: string | null;
  total: number | null;
  subtotal: number | null;
  gst: number | null;
  gstin: string | null;
  invoiceNo: string | null;
  lineItems: Array<{ description: string; amount: number }>;
}

const MONEY = String.raw`(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)`;

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? round2(n) : null;
}

/**
 * Pulls structured fields out of raw OCR text from a bill, receipt or invoice.
 * OCR output is noisy and line-oriented, so this works line by line rather than
 * on the whole blob.
 */
export function extractReceiptFields(ocrText: string): ReceiptFields {
  const rawLines = ocrText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
  const lower = ocrText.toLowerCase();

  // Total: the last "grand total"/"total"/"amount payable" line wins, since
  // receipts print sub-totals above the final figure.
  let total: number | null = null;
  const totalRe = new RegExp(
    String.raw`\b(?:grand\s*total|nett?\s*(?:amount|payable)|amount\s*payable|total\s*(?:amount|payable|bill)?|bill\s*amount|you\s*pay|paid)\b\s*[:\-]?\s*` +
      MONEY,
    'i',
  );
  for (const line of rawLines) {
    if (/\bsub\s*total\b/i.test(line)) continue;
    const m = line.match(totalRe);
    const n = toNumber(m?.[1]);
    if (n !== null) total = n;
  }

  const subtotalMatch = ocrText.match(new RegExp(String.raw`\bsub\s*total\b\s*[:\-]?\s*` + MONEY, 'i'));
  const subtotal = toNumber(subtotalMatch?.[1]);

  // GST may be printed as one line or split into CGST + SGST + IGST.
  const RATE = String.raw`(?:\s*@?\s*[\d.]+\s*%)?`;
  let gst = toNumber(
    ocrText.match(new RegExp(String.raw`\b(?:gst|tax)\s*(?:amount)?` + RATE + String.raw`\s*[:\-]?\s*` + MONEY, 'i'))?.[1],
  );
  const splitTaxes = [...ocrText.matchAll(new RegExp(String.raw`\b(?:c|s|i|u)\s*gst\b` + RATE + String.raw`\s*[:\-]?\s*` + MONEY, 'gi'))]
    .map((m) => toNumber(m[1]))
    .filter((n): n is number => n !== null);
  if (splitTaxes.length) gst = round2(splitTaxes.reduce((a, b) => a + b, 0));

  const gstin = ocrText.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])\b/i)?.[1]?.toUpperCase() ?? null;
  const invoiceNo =
    ocrText.match(/\b(?:invoice|bill|receipt|order)\s*(?:no\.?|number|#|id)\s*[:\-]?\s*([A-Za-z0-9/\-]{3,20})/i)?.[1] ?? null;

  const dateHit = /\d/.test(ocrText) ? extractDate(ocrText) : null;
  const date = dateHit && dateHit.confidence >= 0.5 ? dateHit.value : null;

  // Merchant: the first line that reads like a name rather than an address,
  // a label or a number.
  let merchant: string | null = null;
  for (const line of rawLines.slice(0, 6)) {
    const stripped = line.replace(/[^A-Za-z\s&'.\-]/g, '').trim();
    if (stripped.length < 3) continue;
    if (/\b(?:invoice|receipt|bill|tax|gstin|cin|phone|tel|mob|www|http|address|date|time|order)\b/i.test(line)) continue;
    if (/^\d/.test(line)) continue;
    merchant = stripped.replace(/\s{2,}/g, ' ').trim();
    break;
  }

  // Line items: "<description> <amount>" rows, ignoring the totals block.
  const lineItems: Array<{ description: string; amount: number }> = [];
  for (const line of rawLines) {
    if (/(?:\b|[a-z])(?:gst|vat)\b|\b(?:total|tax|cash|change|balance|round|discount|savings|tender)\b/i.test(line)) continue;
    const m = line.match(new RegExp(String.raw`^(.{3,40}?)\s+` + MONEY + String.raw`\s*$`));
    const amount = toNumber(m?.[2]);
    if (m && amount !== null && amount > 0) {
      const description = m[1].replace(/[.\s]+$/, '').trim();
      if (/[A-Za-z]{3}/.test(description)) lineItems.push({ description, amount });
    }
  }

  // Fall back to the largest amount on the receipt when no total line was found.
  if (total === null) {
    const all = [...lower.matchAll(new RegExp(MONEY, 'gi'))]
      .map((m) => toNumber(m[1]))
      .filter((n): n is number => n !== null && n > 0);
    if (all.length) total = Math.max(...all);
  }

  return { merchant, date, total, subtotal, gst, gstin, invoiceNo, lineItems };
}

/**
 * Runs the OCR text through the same intelligence layer as messages, then
 * overlays the fields that a receipt states explicitly.
 */
export function extractionFromReceipt(ocrText: string, options: ParseOptions = {}): ExtractionResult {
  const fields = extractReceiptFields(ocrText);
  const seed = [fields.merchant, ocrText].filter(Boolean).join(' ');
  const base = parseMessage(seed, options);

  const result: ExtractionResult = { ...base, kind: 'expense', reasons: [...base.reasons] };

  if (fields.total !== null) {
    result.amount = { value: fields.total, confidence: 0.9, evidence: 'receipt total' };
    result.reasons.unshift(`Total ₹${fields.total} read from the receipt.`);
  }
  if (fields.date) {
    result.date = { value: fields.date, confidence: 0.88, evidence: 'receipt date' };
    result.reasons.push(`Date ${fields.date} read from the receipt.`);
  }
  if (fields.merchant && base.merchant.confidence < 0.8) {
    result.merchant = { value: fields.merchant, confidence: 0.7, evidence: 'receipt header' };
    result.reasons.push(`Merchant "${fields.merchant}" read from the receipt header.`);
  }
  if (fields.gst !== null) {
    result.reasons.push(`GST of ₹${fields.gst} identified${fields.gstin ? ` (GSTIN ${fields.gstin})` : ''}.`);
  }
  if (fields.invoiceNo) result.reasons.push(`Invoice number ${fields.invoiceNo}.`);

  result.isTransaction = result.amount.value !== null;
  result.confidence = Math.min(0.97, Math.max(result.confidence, fields.total !== null ? 0.72 : 0.4));
  return result;
}

/** A short remark line summarising what the scanner found, for the review screen. */
export function receiptSummary(fields: ReceiptFields): string {
  const bits: string[] = [];
  if (fields.invoiceNo) bits.push(`Invoice ${fields.invoiceNo}`);
  if (fields.gst !== null) bits.push(`GST ₹${fields.gst}`);
  if (fields.gstin) bits.push(`GSTIN ${fields.gstin}`);
  if (fields.lineItems.length) bits.push(`${fields.lineItems.length} line items`);
  return bits.join(' · ');
}
