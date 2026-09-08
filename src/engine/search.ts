import type { Account, PaymentMode, Transaction, TxnKind } from '@/types';
import { DEFAULT_CATEGORIES, PAYMENT_MODES } from '@/data/categories';
import { addMonthsToKey, daysInMonth, formatMoney, monthKey, monthLabel, round2, similarity, todayISO } from '@/lib/utils';
import { byCategory, byMerchant, byPaymentMode, expensesOf, incomeOf, totalOf, type Slice } from './analytics';
import { findBank, findMerchant } from './parser/entities';

export interface SearchFilters {
  from?: string;
  to?: string;
  kind?: TxnKind;
  categories?: string[];
  paymentModes?: PaymentMode[];
  merchants?: string[];
  banks?: string[];
  minAmount?: number;
  maxAmount?: number;
  text?: string;
  limit?: number;
  /** 'sum' | 'list' | 'top-merchants' | 'top-categories' | 'most-used-mode' */
  intent: SearchIntent;
}

export type SearchIntent = 'sum' | 'list' | 'top-merchants' | 'top-categories' | 'most-used-mode' | 'count' | 'average';

export interface SearchAnswer {
  question: string;
  headline: string;
  detail: string;
  filters: SearchFilters;
  transactions: Transaction[];
  slices: Slice[];
  total: number;
  understood: boolean;
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function monthBounds(key: string): { from: string; to: string } {
  return { from: `${key}-01`, to: `${key}-${String(daysInMonth(key)).padStart(2, '0')}` };
}

/** Resolves the time expression in a question into a concrete date window. */
export function parsePeriod(q: string, today = todayISO()): { from?: string; to?: string; label: string } {
  const lower = q.toLowerCase();
  const thisMonth = monthKey(today);
  const year = Number(today.slice(0, 4));

  if (/\blast month\b|\bprevious month\b/.test(lower)) {
    const key = addMonthsToKey(thisMonth, -1);
    return { ...monthBounds(key), label: monthLabel(key) };
  }
  if (/\bthis month\b|\bcurrent month\b/.test(lower)) {
    return { ...monthBounds(thisMonth), label: monthLabel(thisMonth) };
  }
  if (/\blast year\b/.test(lower)) {
    return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: String(year - 1) };
  }
  if (/\bthis year\b|\bytd\b|\byear to date\b/.test(lower)) {
    return { from: `${year}-01-01`, to: today, label: `${year} so far` };
  }
  if (/\bthis week\b|\blast 7 days\b|\bpast week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString().slice(0, 10), to: today, label: 'the last 7 days' };
  }
  if (/\btoday\b/.test(lower)) return { from: today, to: today, label: 'today' };
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    return { from: iso, to: iso, label: 'yesterday' };
  }

  const lastN = lower.match(/\blast\s+(\d{1,2})\s+(days?|weeks?|months?)\b/);
  if (lastN) {
    const n = Number(lastN[1]);
    const d = new Date(today);
    if (lastN[2].startsWith('day')) d.setDate(d.getDate() - n);
    else if (lastN[2].startsWith('week')) d.setDate(d.getDate() - n * 7);
    else d.setMonth(d.getMonth() - n);
    return { from: d.toISOString().slice(0, 10), to: today, label: `the last ${n} ${lastN[2]}` };
  }

  // Named month, optionally with a year: "in August", "March 2025"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const name = MONTH_NAMES[i];
    const re = new RegExp(`\\b${name.slice(0, 3)}[a-z]*\\b(?:\\s+(\\d{4}))?`, 'i');
    const m = lower.match(re);
    if (m) {
      const y = m[1] ? Number(m[1]) : Number(thisMonth.slice(0, 4));
      const key = `${y}-${String(i + 1).padStart(2, '0')}`;
      // A bare month in the future means last year's.
      const resolved = !m[1] && key > thisMonth ? `${y - 1}-${String(i + 1).padStart(2, '0')}` : key;
      return { ...monthBounds(resolved), label: monthLabel(resolved) };
    }
  }

  const bareYear = lower.match(/\b(20\d{2})\b/);
  if (bareYear) return { from: `${bareYear[1]}-01-01`, to: `${bareYear[1]}-12-31`, label: bareYear[1] };

  return { label: 'all time' };
}

function detectIntent(lower: string): SearchIntent {
  if (/\btop\s+\d*\s*merchants?\b|\bwhich merchants?\b|\bwhere did i (?:spend|shop)\b/.test(lower)) return 'top-merchants';
  if (/\btop\s+\d*\s*categor(?:y|ies)\b|\bbreak\s?down\b|\bby category\b/.test(lower)) return 'top-categories';
  if (/\bwhich (?:card|payment|mode|method)\b|\bmost used (?:card|payment)\b|\bused most\b/.test(lower)) return 'most-used-mode';
  if (/\bhow many\b|\bnumber of\b|\bcount\b/.test(lower)) return 'count';
  if (/\baverage\b|\bavg\b|\bmean\b|\bper day\b/.test(lower)) return 'average';
  if (/\bhow much\b|\btotal\b|\bsum\b|\bspend\b|\bspent\b/.test(lower)) return 'sum';
  return 'list';
}

/** Best-matching known category for a phrase, using fuzzy comparison. */
function matchCategories(lower: string, extra: string[]): string[] {
  const names = [...DEFAULT_CATEGORIES.map((c) => c.name), ...extra];
  const hits: string[] = [];
  for (const name of names) {
    const n = name.toLowerCase();
    if (lower.includes(n)) {
      hits.push(name);
      continue;
    }
    // Common shorthands people actually type.
    const head = n.split(/[&/]/)[0].trim();
    if (head.length > 3 && new RegExp(`\\b${head}\\b`).test(lower)) hits.push(name);
  }
  if (hits.length) return [...new Set(hits)];

  const words = lower.split(/\s+/).filter((w) => w.length > 3);
  for (const w of words) {
    for (const name of names) {
      if (similarity(w, name.toLowerCase().split(/[&/ ]/)[0]) > 0.82) hits.push(name);
    }
  }
  return [...new Set(hits)];
}

/**
 * Answers plain-English questions about the ledger.
 * Everything is resolved locally — the ledger never leaves the device.
 */
export function smartSearch(
  question: string,
  txns: Transaction[],
  accounts: Account[] = [],
  today = todayISO(),
  extraCategories: string[] = [],
): SearchAnswer {
  const lower = question.toLowerCase().trim();
  const period = parsePeriod(lower, today);
  const intent = detectIntent(lower);

  const kind: TxnKind | undefined = /\bincome|earn(?:ed|ings)?|salary|credited|received\b/.test(lower)
    ? 'income'
    : /\bspen[dt]|expense|paid|debited|cost\b/.test(lower)
      ? 'expense'
      : undefined;

  const categories = matchCategories(lower, extraCategories);
  const modes = PAYMENT_MODES.filter((m) => lower.includes(m.toLowerCase()) || (m === 'Credit Card' && /\bcredit\b/.test(lower)) || (m === 'UPI' && /\bupi\b/.test(lower)));
  const merchantHit = findMerchant(question);
  const bankHit = findBank(question);

  const amountAbove = lower.match(/\b(?:above|over|more than|greater than|>)\s*(?:₹|rs\.?)?\s*([\d,]+)/);
  const amountBelow = lower.match(/\b(?:below|under|less than|<)\s*(?:₹|rs\.?)?\s*([\d,]+)/);
  const topN = Number(lower.match(/\btop\s+(\d{1,2})\b/)?.[1] ?? 10);

  const filters: SearchFilters = {
    from: period.from,
    to: period.to,
    kind,
    categories: categories.length ? categories : undefined,
    paymentModes: modes.length ? modes : undefined,
    merchants: merchantHit ? [merchantHit.value] : undefined,
    banks: bankHit ? [bankHit.value] : undefined,
    minAmount: amountAbove ? Number(amountAbove[1].replace(/,/g, '')) : undefined,
    maxAmount: amountBelow ? Number(amountBelow[1].replace(/,/g, '')) : undefined,
    limit: topN,
    intent,
  };

  const matched = applyFilters(txns, filters, accounts);
  const understood =
    Boolean(period.from) || categories.length > 0 || modes.length > 0 || Boolean(merchantHit) || intent !== 'list';

  return buildAnswer(question, matched, filters, period.label, accounts, understood);
}

export function applyFilters(txns: Transaction[], f: SearchFilters, accounts: Account[] = []): Transaction[] {
  const bankAccountIds = f.banks?.length
    ? new Set(accounts.filter((a) => f.banks!.some((b) => a.bankName.toLowerCase().includes(b.toLowerCase().split(' ')[0]))).map((a) => a.id))
    : null;

  return txns.filter((t) => {
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.kind && t.kind !== f.kind) return false;
    if (f.categories?.length && !f.categories.includes(t.category)) return false;
    if (f.paymentModes?.length && !f.paymentModes.includes(t.paymentMode)) return false;
    if (f.merchants?.length && !f.merchants.some((m) => t.merchant.toLowerCase().includes(m.toLowerCase()))) return false;
    if (bankAccountIds && !(t.accountId && bankAccountIds.has(t.accountId))) return false;
    if (f.minAmount !== undefined && t.amount < f.minAmount) return false;
    if (f.maxAmount !== undefined && t.amount > f.maxAmount) return false;
    if (f.text) {
      const hay = `${t.merchant} ${t.category} ${t.subcategory ?? ''} ${t.remarks ?? ''} ${t.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(f.text.toLowerCase())) return false;
    }
    return true;
  });
}

function buildAnswer(
  question: string,
  matched: Transaction[],
  filters: SearchFilters,
  periodLabel: string,
  accounts: Account[],
  understood: boolean,
): SearchAnswer {
  // Aggregate questions are about spending unless income is asked for explicitly;
  // a plain "show me..." list keeps both sides of the ledger.
  const aggregating = filters.intent !== 'list';
  const effectiveKind: TxnKind | undefined = filters.kind ?? (aggregating ? 'expense' : undefined);
  const scoped = effectiveKind === 'income' ? incomeOf(matched) : expensesOf(matched);
  const rows = effectiveKind ? scoped : matched;
  const total = totalOf(scoped);
  const what = filters.categories?.length ? filters.categories.join(', ') : filters.merchants?.[0] ?? (effectiveKind === 'income' ? 'income' : 'spending');

  const base = { question, filters, transactions: sortByDate(rows), slices: [] as Slice[], total, understood };

  switch (filters.intent) {
    case 'top-merchants': {
      const slices = byMerchant(matched).slice(0, filters.limit ?? 10);
      return {
        ...base,
        slices,
        headline: slices.length ? `${slices[0].name} — ${formatMoney(slices[0].value)}` : 'No merchants found',
        detail: slices.length
          ? `Your top ${slices.length} merchants in ${periodLabel} by total spend.`
          : `Nothing recorded in ${periodLabel}.`,
      };
    }
    case 'top-categories': {
      const slices = byCategory(matched).slice(0, filters.limit ?? 10);
      return {
        ...base,
        slices,
        headline: slices.length ? `${slices[0].name} — ${formatMoney(slices[0].value)} (${slices[0].share}%)` : 'No categories found',
        detail: slices.length ? `Category breakdown for ${periodLabel}.` : `Nothing recorded in ${periodLabel}.`,
      };
    }
    case 'most-used-mode': {
      const slices = byPaymentMode(matched);
      const cardSlices = byCardName(matched, accounts);
      const useCards = /\bcard\b/.test(question.toLowerCase()) && cardSlices.length > 0;
      const chosen = useCards ? cardSlices : slices;
      return {
        ...base,
        slices: chosen,
        headline: chosen.length ? `${chosen[0].name} — ${formatMoney(chosen[0].value)} across ${chosen[0].count} transactions` : 'No payments found',
        detail: chosen.length
          ? `Most used ${useCards ? 'card' : 'payment mode'} in ${periodLabel}, ${chosen[0].share}% of spend.`
          : `Nothing recorded in ${periodLabel}.`,
      };
    }
    case 'count':
      return {
        ...base,
        headline: `${rows.length} transaction${rows.length === 1 ? '' : 's'}`,
        detail: `Matching ${what} in ${periodLabel}, totalling ${formatMoney(total)}.`,
      };
    case 'average': {
      const days = new Set(rows.map((t) => t.date)).size || 1;
      const perTxn = rows.length ? round2(total / rows.length) : 0;
      return {
        ...base,
        headline: `${formatMoney(round2(total / days))} per active day`,
        detail: `${formatMoney(perTxn)} per transaction across ${rows.length} entries in ${periodLabel}.`,
      };
    }
    case 'sum':
    default:
      return {
        ...base,
        slices: byCategory(matched).slice(0, 6),
        headline: formatMoney(total),
        detail: rows.length
          ? `${rows.length} transaction${rows.length === 1 ? '' : 's'} for ${what} in ${periodLabel}.`
          : `Nothing recorded for ${what} in ${periodLabel}.`,
      };
  }
}

function byCardName(txns: Transaction[], accounts: Account[]): Slice[] {
  const cards = accounts.filter((a) => a.accountType === 'Credit Card');
  if (!cards.length) return [];
  const rows = expensesOf(txns).filter((t) => cards.some((c) => c.id === t.accountId));
  const total = totalOf(rows);
  const groups: Record<string, { value: number; count: number }> = {};
  for (const t of rows) {
    const card = cards.find((c) => c.id === t.accountId)!;
    const name = `${card.cardName || card.accountName} ····${card.last4}`;
    groups[name] ||= { value: 0, count: 0 };
    groups[name].value += t.amount;
    groups[name].count += 1;
  }
  return Object.entries(groups)
    .map(([name, v]) => ({ name, value: round2(v.value), count: v.count, share: total ? round2((v.value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);
}

function sortByDate(txns: Transaction[]): Transaction[] {
  return [...txns].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export const SEARCH_EXAMPLES = [
  'How much did I spend on food last month?',
  'Show fuel expenses in August',
  'Which credit card was used most?',
  'What are my top 10 merchants?',
  'Total grocery spend this year',
  'How many transactions above 5000 this month?',
  'Average daily spend last 30 days',
  'Show my salary income this year',
];
