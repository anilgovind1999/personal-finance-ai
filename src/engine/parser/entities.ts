import type { PaymentMode } from '@/types';
import { BANKS, MERCHANTS, PAYMENT_MODE_MARKERS, WALLETS, type MerchantEntry } from './lexicon';
import { titleCase } from '@/lib/utils';

export interface Hit<T> {
  value: T;
  confidence: number;
  evidence: string;
}

/** Escapes a lexicon alias for safe use in a RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasRegex(alias: string): RegExp {
  // \b does not work next to '@' or '.', so guard with non-word lookarounds.
  return new RegExp(`(?<![a-z0-9])${esc(alias)}(?![a-z0-9])`, 'i');
}

export function findMerchant(text: string): (Hit<string> & { entry: MerchantEntry }) | null {
  const lower = text.toLowerCase();
  let best: (Hit<string> & { entry: MerchantEntry }) | null = null;
  for (const entry of MERCHANTS) {
    for (const alias of entry.aliases) {
      if (!aliasRegex(alias).test(lower)) continue;
      // Longer aliases are more specific, so they win ties.
      const conf = Math.min(0.97, 0.78 + alias.length * 0.015);
      if (!best || alias.length > best.evidence.length) {
        best = { value: entry.name, confidence: conf, evidence: alias, entry };
      }
    }
  }
  return best;
}

export function findBank(text: string): Hit<string> | null {
  const lower = text.toLowerCase();
  let best: Hit<string> | null = null;
  for (const bank of BANKS) {
    for (const alias of bank.aliases) {
      if (!aliasRegex(alias).test(lower)) continue;
      if (!best || alias.length > best.evidence.length) {
        best = { value: bank.name, confidence: Math.min(0.95, 0.8 + alias.length * 0.015), evidence: alias };
      }
    }
  }
  return best;
}

/**
 * Card / account last-4. Indian bank SMS mask these many ways: 'XX4521',
 * 'x3311', 'A/C *8866', 'ending 1234', or just 'Card 6644'.
 */
export function findLast4(text: string): Hit<string> | null {
  const patterns: Array<[RegExp, number]> = [
    [/\b(?:card|a\/c|ac|acct|account)\s*(?:no\.?|number)?\s*(?:x|\*|\.){1,}\s*(\d{4})\b/i, 0.95],
    [/\b(?:x|\*){2,}\s*(\d{4})\b/i, 0.9],
    // A single 'x' or '*' immediately against four digits is a mask, not a word.
    [/(?:^|[\s(])[x*](\d{4})\b/i, 0.88],
    [/\bending(?:\s+(?:with|in))?\s*(\d{4})\b/i, 0.92],
    [/\blast\s*4\s*(?:digits?)?\s*[:\-]?\s*(\d{4})\b/i, 0.9],
    [/\bcc\s*(\d{4})\b/i, 0.85],
    [/\b(?:card|a\/c|account)\s*(?:no\.?|number)?\s*[:\-]?\s*(\d{4})\b/i, 0.7],
  ];
  for (const [re, conf] of patterns) {
    const m = text.match(re);
    if (m) return { value: m[1], confidence: conf, evidence: m[0].trim() };
  }
  return null;
}

export function findPaymentMode(text: string): Hit<PaymentMode> | null {
  const lower = text.toLowerCase();
  let best: Hit<PaymentMode> | null = null;
  for (const [mode, markers] of PAYMENT_MODE_MARKERS) {
    for (const marker of markers) {
      if (!aliasRegex(marker).test(lower)) continue;
      const conf = Math.min(0.96, 0.72 + marker.length * 0.02);
      if (!best || conf > best.confidence) best = { value: mode, confidence: conf, evidence: marker };
    }
  }
  // A named wallet brand outranks a generic 'wallet' hit.
  for (const w of WALLETS) {
    if (lower.includes(w)) return { value: 'Wallet', confidence: 0.93, evidence: w };
  }
  return best;
}

/** 'at Phoenix Mall, Chennai' / 'in Bengaluru' — a coarse location guess. */
export function findLocation(text: string): Hit<string> | null {
  const cities = [
    'mumbai', 'delhi', 'new delhi', 'bengaluru', 'bangalore', 'chennai', 'kolkata', 'hyderabad',
    'pune', 'ahmedabad', 'kochi', 'cochin', 'ernakulam', 'trivandrum', 'thiruvananthapuram',
    'kozhikode', 'calicut', 'thrissur', 'coimbatore', 'madurai', 'mysuru', 'mysore', 'jaipur',
    'lucknow', 'chandigarh', 'goa', 'noida', 'gurugram', 'gurgaon', 'indore', 'bhopal', 'nagpur',
    'surat', 'vizag', 'visakhapatnam', 'patna', 'guwahati', 'dehradun', 'shimla', 'manali',
  ];
  const lower = text.toLowerCase();
  for (const city of cities) {
    if (aliasRegex(city).test(lower)) {
      return { value: titleCase(city), confidence: 0.8, evidence: city };
    }
  }
  const at = text.match(/\b(?:at|in)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}(?:\s+(?:Mall|Plaza|Road|Street|Nagar|Market|Complex|Station|Airport)))/);
  if (at) return { value: at[1].trim(), confidence: 0.6, evidence: at[0] };
  return null;
}

/**
 * Best-effort merchant name when the lexicon has no match: pulls the phrase after
 * 'at' / 'to' / 'from', or a UPI VPA handle.
 */
/** Payment-service tokens that ride along in a VPA but are not the merchant. */
const PSP_TOKENS = new Set([
  'payu', 'gpay', 'paytm', 'razorpay', 'billdesk', 'ccavenue', 'phonepe', 'bharatpe',
  'ybl', 'okbizaxi', 'upi', 'pay', 'payments', 'payment', 'merchant', 'store',
]);

/** True when a candidate is really a reference number rather than a name. */
function isNoise(candidate: string): boolean {
  const letters = candidate.replace(/[^a-z]/gi, '').length;
  const digits = candidate.replace(/\D/g, '').length;
  return letters < 3 || digits > letters;
}

/**
 * Best-effort merchant when the lexicon has no match: a UPI VPA's own name, or
 * the phrase after 'at' / 'to' / 'from'.
 *
 * Bank SMS are written in Title Case or ALL CAPS ("At AA FOODS AND BEVERAGES"),
 * so the prepositions are matched in either case while the merchant tokens
 * themselves must still start capitalised — that is what separates a name from
 * the surrounding prose.
 */
export function guessMerchantFromText(text: string): Hit<string> | null {
  const vpa = text.match(/\b([a-zA-Z][a-zA-Z0-9._-]{2,})@([a-zA-Z][a-zA-Z0-9]{1,})\b/);
  if (vpa) {
    const cleaned = vpa[1]
      .split(/[._-]+/)
      .filter((part) => part && !PSP_TOKENS.has(part.toLowerCase()))
      .join(' ')
      .trim();
    // 'q400300200@ybl' and 'gpay-99887766554@okbizaxi' name nobody; a merchant
    // handle like 'dailyobjects.payu@axisbank' does.
    if (cleaned && !isNoise(cleaned)) {
      return { value: titleCase(cleaned), confidence: 0.68, evidence: vpa[0] };
    }
  }

  // 'At'/'To' name the payee; 'From' names the account the money left, so it is
  // only a last resort — "Sent Rs.74 From HDFC Bank A/C *7755 To ARJUN NAIR"
  // must yield the person, not the bank.
  const NAME = String.raw`((?:[A-Z][\w&'.*-]*)(?:\s+(?:[A-Z][\w&'.*-]*|AND|and|&)){0,3})`;
  for (const [prepositions, confidence] of [
    [String.raw`[Aa]t|[Tt]o|[Tt]owards`, 0.6],
    [String.raw`[Ff]rom`, 0.45],
  ] as Array<[string, number]>) {
    const re = new RegExp(String.raw`(?:^|\s)(?:${prepositions})\s+` + NAME, 'g');
    for (const m of text.matchAll(re)) {
      const raw = normaliseDescriptor(m[1]);
      if (raw.length < 3) continue;
      if (/^(?:The|My|His|Her|Your|Rs|Inr|Upi|Cc|Block|Reissue|Call|Not|You)$/i.test(raw)) continue;
      // A bank is the rail the payment ran on, never the payee.
      if (/\bbank\b/i.test(raw) || findBank(raw)) continue;
      return { value: raw, confidence, evidence: m[0].trim() };
    }
  }

  const lowerPrep = text.match(/\b(?:at|from)\s+([a-z][a-z&'.-]{2,}(?:\s+[a-z][a-z&'.-]{2,}){0,2})\s+(?:store|shop|mart|stores|bakery|hotel|restaurant|pharmacy|petrol pump)\b/i);
  if (lowerPrep) {
    return { value: titleCase(lowerPrep[0].replace(/^(?:at|from)\s+/i, '')), confidence: 0.5, evidence: lowerPrep[0] };
  }
  return null;
}

/**
 * Card networks prefix the real name with an acquirer code — 'Eas*THEDERMACO',
 * 'SQ *COFFEE'. Drop a short prefix before the star and keep the name.
 */
function normaliseDescriptor(raw: string): string {
  let out = raw.trim().replace(/\s+(?:On|on|For|for|Via|via|Using|using|Through|through|With|with)$/, '');
  const star = out.match(/^([A-Za-z]{1,4})\s*\*\s*(.+)$/);
  if (star) out = star[2];
  return out.replace(/\s{2,}/g, ' ').trim();
}
