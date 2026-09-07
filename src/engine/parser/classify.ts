import type { TxnKind } from '@/types';
import { CATEGORY_KEYWORDS, CREDIT_MARKERS, DEBIT_MARKERS, INCOME_KEYWORDS } from './lexicon';

export interface CategoryScore {
  category: string;
  score: number;
  matched: string[];
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches a keyword phrase on word boundaries so 'sip' does not fire inside 'gossip'. */
function phraseHits(lower: string, phrase: string): number {
  const p = phrase.trim();
  if (!p) return 0;
  const re = new RegExp(`(?<![a-z0-9])${escape(p)}(?![a-z0-9])`, 'g');
  return (lower.match(re) ?? []).length;
}

/** Scores every category in the given map and returns them best-first. */
export function scoreCategories(text: string, kind: TxnKind): CategoryScore[] {
  const lower = ` ${text.toLowerCase()} `;
  const map = kind === 'income' ? INCOME_KEYWORDS : CATEGORY_KEYWORDS;
  const scores: CategoryScore[] = [];
  for (const [category, keywords] of Object.entries(map)) {
    let score = 0;
    const matched: string[] = [];
    for (const [word, weight] of keywords) {
      const hits = phraseHits(lower, word);
      if (hits > 0) {
        // Repeats add evidence but with diminishing returns.
        score += weight * (1 + Math.min(hits - 1, 2) * 0.25);
        matched.push(word.trim());
      }
    }
    if (score > 0) scores.push({ category, score, matched });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

/**
 * Converts the winning category score into a 0..1 confidence.
 * A clear winner with a strong absolute score reads as high confidence;
 * two near-tied categories pull it down.
 */
export function categoryConfidence(scores: CategoryScore[]): number {
  if (!scores.length) return 0;
  const top = scores[0].score;
  const runnerUp = scores[1]?.score ?? 0;
  const strength = Math.min(1, top / 5);
  const margin = top === 0 ? 0 : (top - runnerUp) / top;
  return Math.min(0.95, 0.42 + strength * 0.35 + margin * 0.23);
}

export interface DirectionHit {
  kind: TxnKind;
  confidence: number;
  evidence: string;
}

/** Decides whether the text describes money going out (expense) or coming in (income). */
export function detectDirection(text: string): DirectionHit {
  const lower = ` ${text.toLowerCase()} `;
  let debit = 0;
  let credit = 0;
  let debitEvidence = '';
  let creditEvidence = '';

  for (const marker of DEBIT_MARKERS) {
    if (phraseHits(lower, marker) > 0) {
      debit += marker.length > 6 ? 2 : 1.4;
      if (!debitEvidence) debitEvidence = marker;
    }
  }
  for (const marker of CREDIT_MARKERS) {
    if (phraseHits(lower, marker) > 0) {
      credit += marker.length > 6 ? 2 : 1.4;
      if (!creditEvidence) creditEvidence = marker;
    }
  }

  // Strong income nouns tip the balance even without an explicit verb.
  for (const [, keywords] of Object.entries(INCOME_KEYWORDS)) {
    for (const [word, weight] of keywords) {
      if (weight >= 4 && phraseHits(lower, word) > 0) {
        credit += 2;
        if (!creditEvidence) creditEvidence = word;
      }
    }
  }
  // "paid ... refund" style texts: an explicit debit verb outranks a refund noun.
  if (/\b(?:i\s+)?(?:paid|spent|bought|purchased)\b/.test(lower)) debit += 2.5;

  if (credit > debit) {
    return { kind: 'income', confidence: Math.min(0.95, 0.6 + (credit - debit) * 0.08), evidence: creditEvidence };
  }
  if (debit > credit) {
    return { kind: 'expense', confidence: Math.min(0.95, 0.6 + (debit - credit) * 0.08), evidence: debitEvidence };
  }
  // Default: unlabelled money text in a spend tracker is far more often an expense.
  return { kind: 'expense', confidence: 0.5, evidence: 'no explicit direction — assumed expense' };
}

/** Rejects text that carries no financial signal at all (OTPs, promos, chit-chat). */
export function looksLikeTransaction(text: string, hasAmount: boolean): boolean {
  const lower = text.toLowerCase();
  if (!hasAmount) return false;
  if (/\botp\b|one[- ]time password|do not share|verification code/.test(lower)) return false;
  if (/\b(?:offer|sale|discount|coupon|win|congratulations|apply now|click here|limited period|flat \d+% off)\b/.test(lower) &&
      !/\b(?:debited|credited|spent|paid|purchase)\b/.test(lower)) {
    return false;
  }
  if (/\b(?:will be|is due|due on|reminder|please pay|kindly pay|payable by|statement generated)\b/.test(lower) &&
      !/\b(?:debited|credited|paid|spent)\b/.test(lower)) {
    return false;
  }
  return true;
}
