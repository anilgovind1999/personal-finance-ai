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

/** Card / account last-4, from patterns like 'XX4521', 'ending 1234', 'a/c ...7788'. */
export function findLast4(text: string): Hit<string> | null {
  const patterns: Array<[RegExp, number]> = [
    [/\b(?:card|a\/c|ac|acct|account)\s*(?:no\.?|number)?\s*(?:x|\*|\.){2,}\s*(\d{4})\b/i, 0.95],
    [/\b(?:x|\*){2,}\s*(\d{4})\b/i, 0.9],
    [/\bending(?:\s+(?:with|in))?\s*(\d{4})\b/i, 0.92],
    [/\blast\s*4\s*(?:digits?)?\s*[:\-]?\s*(\d{4})\b/i, 0.9],
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
export function guessMerchantFromText(text: string): Hit<string> | null {
  const vpa = text.match(/\b([a-zA-Z0-9._-]{3,})@(?:ok[a-z]+|ybl|paytm|apl|ibl|axl|upi|sbi|hdfcbank|icici|axisbank)\b/);
  if (vpa) {
    const handle = vpa[1].replace(/[._-]+/g, ' ').trim();
    if (!/^\d+$/.test(handle)) {
      return { value: titleCase(handle), confidence: 0.62, evidence: vpa[0] };
    }
  }

  const prep = text.match(
    /\b(?:at|to|from|towards|paid to|sent to)\s+((?:[A-Z][\w&'.-]*|[A-Z]{2,})(?:\s+(?:[A-Z][\w&'.-]*|[A-Z]{2,})){0,3})/,
  );
  if (prep) {
    const raw = prep[1].trim().replace(/\s+(?:on|for|via|using|through|with)$/i, '');
    if (raw.length >= 3 && !/^(?:the|my|his|her|your|rs|inr)$/i.test(raw)) {
      return { value: raw, confidence: 0.55, evidence: prep[0] };
    }
  }

  const lowerPrep = text.match(/\b(?:at|from)\s+([a-z][a-z&'.-]{2,}(?:\s+[a-z][a-z&'.-]{2,}){0,2})\s+(?:store|shop|mart|stores|bakery|hotel|restaurant|pharmacy|petrol pump)\b/i);
  if (lowerPrep) {
    return { value: titleCase(lowerPrep[0].replace(/^(?:at|from)\s+/i, '')), confidence: 0.5, evidence: lowerPrep[0] };
  }
  return null;
}
