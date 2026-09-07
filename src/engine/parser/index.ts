import type { ExtractionResult, FieldGuess, PaymentMode, TxnKind } from '@/types';
import { clamp, titleCase, todayISO } from '@/lib/utils';
import { extractAmount } from './amount';
import { extractDate } from './date';
import { categoryConfidence, detectDirection, looksLikeTransaction, scoreCategories } from './classify';
import { findBank, findLast4, findLocation, findMerchant, findPaymentMode, guessMerchantFromText } from './entities';

export { extractAmount } from './amount';
export { extractDate } from './date';
export * from './classify';
export * from './entities';

function guess<T>(value: T, confidence: number, evidence?: string): FieldGuess<T> {
  return { value, confidence: clamp(confidence, 0, 1), evidence };
}

export interface ParseOptions {
  /** Reference "now" — injectable so tests are deterministic. */
  now?: Date;
  /** Categories the user has created, so custom names are recognised too. */
  extraCategories?: string[];
}

/**
 * The AI extraction engine: turns a free-text message, SMS, UPI alert or receipt
 * dump into a structured transaction proposal with per-field confidence.
 *
 * Nothing here writes to the ledger — every result goes to the approval queue.
 */
export function parseMessage(text: string, options: ParseOptions = {}): ExtractionResult {
  const now = options.now ?? new Date();
  const clean = text.replace(/\s+/g, ' ').trim();
  const reasons: string[] = [];

  const amountHit = extractAmount(clean);
  const direction = detectDirection(clean);
  const kind: TxnKind = direction.kind;
  const isTransaction = looksLikeTransaction(clean, amountHit !== null);

  if (amountHit) reasons.push(`Amount read from "${amountHit.evidence}".`);
  else reasons.push('No amount found — enter it manually before approving.');
  reasons.push(
    direction.evidence.startsWith('no explicit')
      ? 'Direction not stated; treated as an expense.'
      : `Treated as ${kind} because of "${direction.evidence}".`,
  );

  const dateHit = extractDate(clean, now);
  reasons.push(
    dateHit.confidence >= 0.7
      ? `Date resolved from "${dateHit.evidence}".`
      : 'No date in the text — defaulted to today.',
  );

  // Merchant: lexicon match first, then a structural guess from the sentence.
  const lexMerchant = findMerchant(clean);
  const textMerchant = lexMerchant ? null : guessMerchantFromText(clean);
  const merchantName = lexMerchant?.value ?? textMerchant?.value ?? '';
  const merchantConf = lexMerchant?.confidence ?? textMerchant?.confidence ?? 0;
  if (lexMerchant) reasons.push(`Matched known merchant "${lexMerchant.value}".`);
  else if (textMerchant) reasons.push(`Merchant guessed from "${textMerchant.evidence}".`);

  // Category: a known merchant carries its own category; keywords decide otherwise.
  const scores = scoreCategories(clean, kind);
  const extra = options.extraCategories ?? [];
  const customHit = extra.find((c) => c && new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(clean));

  let category: string;
  let catConf: number;
  let subcategory: string | undefined;
  let subConf = 0;

  const keywordWinner = scores[0];
  const keywordConf = categoryConfidence(scores);

  if (lexMerchant && (!keywordWinner || keywordConf < 0.8 || keywordWinner.category === lexMerchant.entry.category)) {
    category = lexMerchant.entry.category;
    catConf = Math.min(0.95, lexMerchant.confidence);
    subcategory = lexMerchant.entry.subcategory;
    subConf = subcategory ? catConf - 0.1 : 0;
    reasons.push(`Category "${category}" taken from the merchant profile.`);
  } else if (customHit) {
    category = customHit;
    catConf = 0.8;
    reasons.push(`Category "${customHit}" matched a custom category name.`);
  } else if (keywordWinner) {
    category = keywordWinner.category;
    catConf = keywordConf;
    reasons.push(`Category "${category}" from keywords: ${keywordWinner.matched.slice(0, 4).join(', ')}.`);
  } else {
    category = kind === 'income' ? 'Other Income' : 'Other';
    catConf = 0.3;
    reasons.push('No category signal found — defaulted to Other.');
  }

  // Payment mode: explicit marker, else inferred from context.
  const modeHit = findPaymentMode(clean);
  let paymentMode: PaymentMode = modeHit?.value ?? 'UPI';
  let modeConf = modeHit?.confidence ?? 0.35;
  if (modeHit) {
    reasons.push(`Payment mode "${paymentMode}" from "${modeHit.evidence}".`);
  } else if (/\b(?:atm|cash)\b/i.test(clean)) {
    paymentMode = 'Cash';
    modeConf = 0.6;
    reasons.push('Payment mode inferred as Cash.');
  } else {
    reasons.push('Payment mode not stated — defaulted to UPI.');
  }

  const bankHit = findBank(clean);
  if (bankHit) reasons.push(`Bank "${bankHit.value}" recognised.`);
  const last4Hit = findLast4(clean);
  if (last4Hit) reasons.push(`Card/account ending ${last4Hit.value}.`);
  const locationHit = findLocation(clean);

  // A card ending without an explicit mode still tells us it was a card. Which
  // kind matters for the outstanding balance, so only claim debit when nothing
  // in the message points at credit.
  if (!modeHit && last4Hit) {
    const credit = /\b(?:cc|credit)\b/i.test(clean);
    paymentMode = credit ? 'Credit Card' : 'Debit Card';
    modeConf = credit ? 0.6 : 0.45;
  }

  // Falling back to the bank would be misleading — HDFC is who moved the money,
  // not who was paid. A confident category reads as the placeholder it is, but
  // the catch-all categories name nothing, and "Other" is not a merchant.
  const genericCategory = category === 'Other' || category === 'Other Income';
  const merchantFallback = merchantName || (genericCategory ? 'Unknown merchant' : titleCase(category));

  const confidence = aggregateConfidence({
    amount: amountHit?.confidence ?? 0,
    category: catConf,
    paymentMode: modeConf,
    direction: direction.confidence,
    hasAmount: amountHit !== null,
    knownMerchant: lexMerchant !== null,
    knownBank: bankHit !== null,
    dateAssumed: dateHit.confidence < 0.5,
  });

  return {
    kind,
    amount: guess(amountHit ? amountHit.value : null, amountHit?.confidence ?? 0, amountHit?.evidence),
    date: guess(dateHit.value ?? todayISO(), dateHit.confidence, dateHit.evidence),
    merchant: guess(merchantFallback, merchantName ? merchantConf : 0.25, lexMerchant?.evidence ?? textMerchant?.evidence),
    category: guess(category, catConf, keywordWinner?.matched.join(', ')),
    subcategory: subcategory ? guess(subcategory, subConf) : undefined,
    paymentMode: guess(paymentMode, modeConf, modeHit?.evidence),
    bank: guess(bankHit?.value ?? null, bankHit?.confidence ?? 0, bankHit?.evidence),
    last4: guess(last4Hit?.value ?? null, last4Hit?.confidence ?? 0, last4Hit?.evidence),
    location: guess(locationHit?.value ?? null, locationHit?.confidence ?? 0, locationHit?.evidence),
    confidence,
    reasons,
    isTransaction,
  };
}

/**
 * Blends the field confidences into one score.
 *
 * The amount and category carry the decision; date and merchant are treated as
 * small adjustments rather than weighted terms, because a message with no date
 * ("Paid Rs.250 for lunch") is perfectly well understood and should not be
 * scored down as if a field had been misread.
 */
function aggregateConfidence(parts: {
  amount: number;
  category: number;
  paymentMode: number;
  direction: number;
  hasAmount: boolean;
  knownMerchant: boolean;
  knownBank: boolean;
  dateAssumed: boolean;
}): number {
  if (!parts.hasAmount) return clamp(parts.category * 0.25, 0, 0.35);
  const core =
    parts.amount * 0.4 + parts.category * 0.3 + parts.direction * 0.15 + parts.paymentMode * 0.15;
  const adjusted =
    core +
    (parts.knownMerchant ? 0.03 : 0) +
    (parts.knownBank ? 0.02 : 0) -
    (parts.dateAssumed ? 0.04 : 0);
  return clamp(Math.round(adjusted * 100) / 100, 0, 0.99);
}

/** Splits a pasted block of several messages into individual ones. */
export function splitMessages(block: string): string[] {
  return block
    .split(/\n{1,}/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);
}

export function confidenceBand(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.8) return 'high';
  if (c >= 0.55) return 'medium';
  return 'low';
}
