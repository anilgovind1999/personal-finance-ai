import { toISODate } from '@/lib/utils';

export interface DateHit {
  value: string; // ISO yyyy-mm-dd
  confidence: number;
  evidence: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3,
  wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

function shift(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function normaliseYear(y: number): number {
  if (y >= 1000) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function safeISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return toISODate(dt);
}

/**
 * Finds a transaction date in the text. Falls back to today with low confidence
 * so the reviewer can see the field was assumed rather than read.
 */
export function extractDate(text: string, now = new Date()): DateHit {
  const lower = text.toLowerCase();

  // Relative words
  if (/\btoday\b|\bjust now\b|\bnow\b/.test(lower)) {
    return { value: toISODate(now), confidence: 0.9, evidence: 'today' };
  }
  if (/\byesterday\b/.test(lower)) {
    return { value: toISODate(shift(now, -1)), confidence: 0.9, evidence: 'yesterday' };
  }
  if (/\bday before yesterday\b/.test(lower)) {
    return { value: toISODate(shift(now, -2)), confidence: 0.88, evidence: 'day before yesterday' };
  }
  if (/\btomorrow\b/.test(lower)) {
    return { value: toISODate(shift(now, 1)), confidence: 0.85, evidence: 'tomorrow' };
  }

  const agoMatch = lower.match(/\b(\d{1,3})\s*(day|days|week|weeks|month|months)\s+ago\b/);
  if (agoMatch) {
    const n = Number(agoMatch[1]);
    const unit = agoMatch[2];
    const d = new Date(now);
    if (unit.startsWith('day')) d.setDate(d.getDate() - n);
    else if (unit.startsWith('week')) d.setDate(d.getDate() - n * 7);
    else d.setMonth(d.getMonth() - n);
    return { value: toISODate(d), confidence: 0.85, evidence: agoMatch[0] };
  }

  // "last friday" / "on monday"
  const wdMatch = lower.match(/\b(last\s+|this\s+|on\s+)?(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat)\b/);
  if (wdMatch) {
    const target = WEEKDAYS[wdMatch[2]];
    const d = new Date(now);
    let delta = (d.getDay() - target + 7) % 7;
    if (delta === 0) delta = wdMatch[1]?.trim() === 'last' ? 7 : 0;
    d.setDate(d.getDate() - delta);
    return { value: toISODate(d), confidence: 0.75, evidence: wdMatch[0].trim() };
  }

  // ISO: 2026-03-14
  const isoMatch = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const iso = safeISO(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (iso) return { value: iso, confidence: 0.95, evidence: isoMatch[0] };
  }

  // dd/mm/yy(yy) or dd-mm-yyyy — day-first, the Indian convention
  const dmyMatch = lower.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = normaliseYear(Number(dmyMatch[3]));
    const iso = safeISO(y, m, d) ?? safeISO(y, d, m);
    if (iso) return { value: iso, confidence: 0.9, evidence: dmyMatch[0] };
  }

  // Bare day-month with no year: 'On 07-09', 'On 04/09'. Card alerts use this
  // constantly. Resolved against the current year, rolling back if that would
  // put the transaction in the future.
  const dmOnly = lower.match(/\bon\s+(\d{1,2})[/\-.](\d{1,2})(?![/\-.\d])/);
  if (dmOnly) {
    const d = Number(dmOnly[1]);
    const m = Number(dmOnly[2]);
    const iso = safeISO(inferYear(now, m, d), m, d);
    if (iso) return { value: iso, confidence: 0.8, evidence: dmOnly[0] };
  }

  // 14 Mar 2026 / 14th March / Mar 14
  const dMonY = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?(?:[\s,-]*(\d{2,4}))?\b/);
  if (dMonY) {
    const day = Number(dMonY[1]);
    const mon = MONTHS[dMonY[2]];
    const year = dMonY[3] ? normaliseYear(Number(dMonY[3])) : inferYear(now, mon, day);
    const iso = safeISO(year, mon, day);
    if (iso) return { value: iso, confidence: dMonY[3] ? 0.92 : 0.82, evidence: dMonY[0] };
  }

  const monDY = lower.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[\s,]*(\d{2,4}))?\b/);
  if (monDY) {
    const mon = MONTHS[monDY[1]];
    const day = Number(monDY[2]);
    const year = monDY[3] ? normaliseYear(Number(monDY[3])) : inferYear(now, mon, day);
    const iso = safeISO(year, mon, day);
    if (iso) return { value: iso, confidence: monDY[3] ? 0.92 : 0.82, evidence: monDY[0] };
  }

  return { value: toISODate(now), confidence: 0.35, evidence: 'assumed today (no date in text)' };
}

/** A bare "14 Mar" means this year, unless that is in the future — then last year. */
function inferYear(now: Date, month: number, day: number): number {
  const candidate = new Date(now.getFullYear(), month - 1, day);
  return candidate.getTime() > now.getTime() + 86400000 ? now.getFullYear() - 1 : now.getFullYear();
}
