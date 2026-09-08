import type { CaptureSource, ISODate, PendingItem, Transaction } from '@/types';

/**
 * Cross-referencing a card SMS against the confirmation email for the same
 * purchase.
 *
 * A single spend often announces itself twice: the bank texts the moment the
 * card is used, and the merchant emails a receipt minutes later. Both are worth
 * capturing — between them they carry more than either alone, since the SMS
 * knows the card and the email knows what was actually bought — but they must
 * not become two expenses.
 *
 * So every incoming capture is checked against what is already in the review
 * queue and against the recent ledger. The rules below are deliberately
 * conservative, because the two mistakes are not equally bad: merging two
 * genuinely separate purchases destroys a record silently, while failing to
 * merge only leaves a duplicate for the reviewer to notice. When the evidence
 * is strong the captures are merged; when it merely rhymes, both are kept and
 * the newer one is flagged so the reviewer decides.
 */

/** Amounts this close are treated as the same figure — paise rounding, not a different spend. */
const AMOUNT_TOLERANCE = 0.5;

/** An email receipt can be dated a day or two after the card was tapped. */
const DAY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Ledger rows older than this are not considered; a match that far back is coincidence. */
const LEDGER_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

const DUPLICATE_AT = 0.55;
const POSSIBLE_AT = 0.25;

export type MatchVerdict = 'duplicate' | 'possible' | 'distinct';

export interface CaptureMatch {
  verdict: MatchVerdict;
  /** 0..1 strength of the corroborating evidence, once amount and date agree. */
  score: number;
  reasons: string[];
  /** The queued capture this one matches, when it is one. */
  pendingId?: string;
  /** The posted transaction this one matches, when it is one. */
  transactionId?: string;
}

const NOISE = new Set([
  'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'india', 'in', 'the', 'and',
  'payment', 'payments', 'purchase', 'txn', 'transaction', 'order', 'ref', 'upi',
  'services', 'service', 'technologies', 'solutions', 'store', 'online', 'unknown',
  'merchant', 'retail', 'pay', 'bill',
]);

/** Reduces a merchant string to comparable words, so "AMAZON PAY INDIA PVT LTD" meets "Amazon". */
export function merchantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE.has(w) && !/^\d+$/.test(w));
}

/** -1 when the names clearly disagree, 0 when one is unknown, up to 1 when they agree. */
export function merchantAffinity(a: string, b: string): number {
  const left = merchantTokens(a);
  const right = merchantTokens(b);
  if (!left.length || !right.length) return 0; // one side never identified a merchant
  const overlap = left.filter((w) => right.includes(w) || right.some((r) => r.startsWith(w) || w.startsWith(r)));
  if (!overlap.length) return -1;
  return overlap.length / Math.min(left.length, right.length);
}

function daysApart(a: ISODate, b: ISODate): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right);
}

/** The facts a capture offers for comparison, from either a queued item or a ledger row. */
interface Facts {
  kind: string;
  amount: number;
  date: ISODate;
  merchant: string;
  last4: string | null;
  bank: string | null;
  paymentMode: string;
  source: CaptureSource;
  rawText: string;
}

function factsOfPending(item: PendingItem): Facts {
  return {
    kind: item.draft.kind,
    amount: item.draft.amount,
    date: item.draft.date,
    merchant: item.draft.merchant,
    last4: item.extraction.last4.value,
    bank: item.extraction.bank.value,
    paymentMode: item.draft.paymentMode,
    source: item.source,
    rawText: item.rawText,
  };
}

function factsOfTransaction(t: Transaction): Facts {
  return {
    kind: t.kind,
    amount: t.amount,
    date: t.date,
    merchant: t.merchant,
    last4: null,
    bank: null,
    paymentMode: t.paymentMode,
    source: t.source,
    rawText: '',
  };
}

/**
 * Weighs one capture against one earlier record.
 *
 * Amount, direction and date are gates rather than scores: if any of them
 * disagree these are different events, whatever else lines up. Only then is the
 * corroborating evidence weighed.
 */
export function compareCaptures(incoming: Facts, existing: Facts): CaptureMatch {
  const reasons: string[] = [];

  if (incoming.kind !== existing.kind) return { verdict: 'distinct', score: 0, reasons: [] };
  if (!incoming.amount || !existing.amount) return { verdict: 'distinct', score: 0, reasons: [] };
  if (Math.abs(incoming.amount - existing.amount) > AMOUNT_TOLERANCE) {
    return { verdict: 'distinct', score: 0, reasons: [] };
  }
  if (daysApart(incoming.date, existing.date) > DAY_WINDOW_MS) {
    return { verdict: 'distinct', score: 0, reasons: [] };
  }

  // The same message pasted twice needs no further argument.
  if (incoming.rawText && incoming.rawText.trim() === existing.rawText.trim()) {
    return { verdict: 'duplicate', score: 1, reasons: ['The same message was already captured.'] };
  }

  // Passing all three gates is already a coincidence worth weighing: the same
  // sum, in the same direction, within days. That is the base the rest builds on.
  reasons.push('Same amount, same direction, within three days.');
  let score = 0.2;

  if (incoming.last4 && existing.last4) {
    if (incoming.last4 === existing.last4) {
      score += 0.5;
      reasons.push(`Both mention card ending ${incoming.last4}.`);
    } else {
      // Two different cards cannot be one payment.
      return { verdict: 'distinct', score: 0, reasons: [] };
    }
  }

  const affinity = merchantAffinity(incoming.merchant, existing.merchant);
  if (affinity > 0.5) {
    score += 0.45;
    reasons.push(`Merchant agrees (“${existing.merchant}” / “${incoming.merchant}”).`);
  } else if (affinity > 0) {
    score += 0.2;
    reasons.push('Merchant names partly overlap.');
  } else if (affinity < 0) {
    // Both sides named a merchant and they are not the same one. Two shops are
    // two purchases, however well the figures line up.
    return { verdict: 'distinct', score: 0, reasons: [] };
  }

  if (incoming.bank && existing.bank) {
    if (incoming.bank === existing.bank) {
      score += 0.2;
      reasons.push(`Both name ${existing.bank}.`);
    } else {
      score -= 0.3;
      reasons.push('Different banks are named.');
    }
  }

  if (incoming.paymentMode === existing.paymentMode) score += 0.1;

  // Two independent channels describing one spend is the case this exists for.
  if (incoming.source !== existing.source) {
    score += 0.15;
    reasons.push(`Corroborated across ${existing.source} and ${incoming.source}.`);
  }

  const verdict: MatchVerdict = score >= DUPLICATE_AT ? 'duplicate' : score >= POSSIBLE_AT ? 'possible' : 'distinct';
  return { verdict, score: Math.max(0, Math.min(1, score)), reasons: verdict === 'distinct' ? [] : reasons };
}

/**
 * Finds what an incoming capture duplicates, if anything.
 *
 * Queued items are searched before posted ones: merging into a capture still
 * awaiting review is free, whereas a match against the ledger can only ever be
 * a warning, since that money is already recorded.
 */
export function findMatch(
  incoming: PendingItem,
  queue: PendingItem[],
  ledger: Transaction[],
  now = new Date(),
): CaptureMatch {
  const facts = factsOfPending(incoming);

  let best: CaptureMatch = { verdict: 'distinct', score: 0, reasons: [] };
  for (const item of queue) {
    if (item.id === incoming.id || item.status !== 'pending') continue;
    const match = compareCaptures(facts, factsOfPending(item));
    if (match.verdict !== 'distinct' && match.score > best.score) best = { ...match, pendingId: item.id };
  }
  if (best.verdict === 'duplicate') return best;

  for (const t of ledger) {
    if (now.getTime() - Date.parse(t.date) > LEDGER_LOOKBACK_MS) continue;
    const match = compareCaptures(facts, factsOfTransaction(t));
    if (match.verdict === 'distinct' || match.score <= best.score) continue;
    // Money already in the ledger is never merged silently — the reviewer is told.
    best = { ...match, verdict: 'possible', transactionId: t.id };
  }

  return best;
}

/** Picks the better-evidenced of two guesses about the same field. */
function betterGuess<T>(a: { value: T; confidence: number; evidence?: string }, b: { value: T; confidence: number; evidence?: string }) {
  return b.confidence > a.confidence ? b : a;
}

const WEAK_MERCHANT = /^(unknown merchant|other|)$/i;

/**
 * Folds a corroborating capture into the one already queued.
 *
 * The queued item keeps its identity — its id, its place in the queue and
 * anything the reviewer has already typed into its draft. What the new capture
 * contributes is evidence: fields it knows better, and the fact of agreement,
 * which is itself the strongest signal the engine has that the reading is right.
 */
export function mergeCaptures(existing: PendingItem, incoming: PendingItem): PendingItem {
  const ex = existing.extraction;
  const inc = incoming.extraction;

  const merchant = betterGuess(ex.merchant, inc.merchant);
  const category = betterGuess(ex.category, inc.category);

  // Independent agreement on the amount is worth more than either reading alone.
  const agreed = Math.max(ex.confidence, inc.confidence);
  const confidence = Math.min(0.99, agreed + 0.1);

  const corroboration = [
    ...(existing.corroboration ?? []),
    {
      source: incoming.source,
      receivedAt: incoming.receivedAt,
      rawText: incoming.rawText,
    },
  ];

  return {
    ...existing,
    extraction: {
      ...ex,
      merchant,
      category,
      subcategory: ex.subcategory ?? inc.subcategory,
      bank: ex.bank.value ? ex.bank : inc.bank,
      last4: ex.last4.value ? ex.last4 : inc.last4,
      location: ex.location.value ? ex.location : inc.location,
      confidence,
      reasons: [
        ...ex.reasons,
        `Cross-checked against a ${incoming.source} capture: the amount and date agree.`,
      ],
    },
    draft: {
      ...existing.draft,
      // Only fill gaps. Anything the reviewer already sees stays put.
      merchant: WEAK_MERCHANT.test(existing.draft.merchant) ? incoming.draft.merchant : existing.draft.merchant,
      category: existing.draft.category === 'Other' ? incoming.draft.category : existing.draft.category,
      subcategory: existing.draft.subcategory ?? incoming.draft.subcategory,
      accountId: existing.draft.accountId ?? incoming.draft.accountId,
      location: existing.draft.location ?? incoming.draft.location,
    },
    attachmentIds: [...new Set([...existing.attachmentIds, ...incoming.attachmentIds])],
    corroboration,
  };
}
