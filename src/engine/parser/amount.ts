import { round2 } from '@/lib/utils';

export interface AmountHit {
  value: number;
  confidence: number;
  evidence: string;
}

/** Indian number words for amounts written out ("two thousand"). */
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const MULTIPLIERS: Record<string, number> = {
  hundred: 100, thousand: 1000, k: 1000, lakh: 100000, lac: 100000, lakhs: 100000,
  lacs: 100000, crore: 10000000, crores: 10000000, cr: 10000000, million: 1000000, m: 1000000,
};

/** Strips Indian digit grouping: '1,23,456.78' -> 123456.78 */
function parseGrouped(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

/**
 * Extracts the transaction amount from raw text.
 * Currency-marked numbers win over bare ones; account numbers, dates, card digits,
 * reference numbers and balances are excluded.
 */
export function extractAmount(text: string): AmountHit | null {
  const lower = text.toLowerCase();
  const candidates: AmountHit[] = [];

  // 1. Currency-prefixed: ₹250, Rs.2,500.50, INR 1200, Rs 1.2k
  const currencyRe =
    /(?:₹|rs\.?|inr|rupees?)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(k|lakh|lakhs|lac|lacs|crore|crores|cr|thousand|hundred|million|m)?(?![a-z])/gi;
  for (const m of lower.matchAll(currencyRe)) {
    let value = parseGrouped(m[1]);
    if (m[2]) value *= MULTIPLIERS[m[2].toLowerCase()] ?? 1;
    if (!Number.isFinite(value) || value <= 0) continue;
    candidates.push({ value: round2(value), confidence: 0.95, evidence: m[0].trim() });
  }

  // 2. Currency-suffixed: 250 rs, 1200 rupees, 2.5 lakh rupees
  const suffixRe =
    /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:(k|lakh|lakhs|lac|lacs|crore|crores|cr|thousand)(?![a-z]))?\s*(?:₹|rs\.?|inr|rupees?|bucks)\b/gi;
  for (const m of lower.matchAll(suffixRe)) {
    let value = parseGrouped(m[1]);
    if (m[2]) value *= MULTIPLIERS[m[2].toLowerCase()] ?? 1;
    if (!Number.isFinite(value) || value <= 0) continue;
    candidates.push({ value: round2(value), confidence: 0.92, evidence: m[0].trim() });
  }

  // 3. Verb-anchored bare numbers: "spent 450 on", "paid 1200 for", "debited by 340"
  const verbRe =
    /\b(?:spent|paid|pay|debited(?:\s+by)?|credited(?:\s+by)?|charged|cost|costs|worth(?:\s+of)?|received|for|of|withdrew|deposited|transferred)\s+(?:a\s+)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:(k|lakh|lakhs|lac|lacs|crore|crores|cr|thousand)(?![a-z]))?/gi;
  for (const m of lower.matchAll(verbRe)) {
    let value = parseGrouped(m[1]);
    const mult = m[2] ? MULTIPLIERS[m[2].toLowerCase()] : undefined;
    if (mult) value *= mult;
    if (!Number.isFinite(value) || value <= 0) continue;
    // A bare 2-digit number after "for"/"of" is usually a count, not money.
    const weak = !mult && value < 10;
    candidates.push({ value: round2(value), confidence: weak ? 0.4 : 0.7, evidence: m[0].trim() });
  }

  // 4. Number words: "two thousand five hundred"
  const wordHit = extractWordAmount(lower);
  if (wordHit) candidates.push(wordHit);

  if (!candidates.length) return null;

  const excluded = excludedNumbers(lower);
  const viable = candidates.filter((c) => !excluded.has(c.value));
  const pool = viable.length ? viable : candidates;

  // Prefer the strongest signal; break ties with the larger amount (SMS often
  // quotes both the txn amount and a smaller fee).
  pool.sort((a, b) => b.confidence - a.confidence || b.value - a.value);
  return pool[0];
}

/**
 * Numbers that appear as balances, card digits, reference ids, OTPs or dates
 * must never be mistaken for the transaction amount.
 */
function excludedNumbers(lower: string): Set<number> {
  const out = new Set<number>();
  const patterns = [
    /(?:avl|available|avbl|closing|clsg|current)\s*(?:bal|balance)[^0-9]{0,12}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
    /\bbal(?:ance)?\s*(?:is|:)?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
    /(?:ref(?:erence)?(?:\s*no)?|txn(?:\s*id)?|utr|order(?:\s*id)?|invoice(?:\s*no)?)[^0-9]{0,8}([0-9]{6,})/gi,
    /\b(?:a\/c|acct?|account|card|xx+|ending)[^0-9]{0,8}([0-9]{3,})/gi,
    /\botp[^0-9]{0,8}([0-9]{4,8})/gi,
    /\b(?:limit|credit limit)[^0-9]{0,10}([0-9][0-9,]*)/gi,
  ];
  for (const re of patterns) {
    for (const m of lower.matchAll(re)) {
      const n = parseGrouped(m[1]);
      if (Number.isFinite(n)) out.add(round2(n));
    }
  }
  return out;
}

function extractWordAmount(lower: string): AmountHit | null {
  const tokens = lower.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  let best: AmountHit | null = null;
  let i = 0;
  while (i < tokens.length) {
    if (!(tokens[i] in WORD_NUMBERS)) {
      i++;
      continue;
    }
    let total = 0;
    let group = 0;
    const start = i;
    let sawMultiplier = false;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t in WORD_NUMBERS) {
        group += WORD_NUMBERS[t];
        i++;
      } else if (t in MULTIPLIERS && MULTIPLIERS[t] >= 100) {
        const mult = MULTIPLIERS[t];
        sawMultiplier = true;
        if (mult === 100) {
          group = (group || 1) * 100;
        } else {
          total += (group || 1) * mult;
          group = 0;
        }
        i++;
      } else if (t === 'and') {
        i++;
      } else {
        break;
      }
    }
    const value = total + group;
    // A lone small word-number ("two coffees") is not an amount.
    if (sawMultiplier && value > 0 && (!best || value > best.value)) {
      best = { value, confidence: 0.6, evidence: tokens.slice(start, i).join(' ') };
    }
  }
  return best;
}
