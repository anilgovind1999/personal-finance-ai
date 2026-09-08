import type { AppState, Budget, Goal, PaymentMode, Transaction } from '@/types';
import { emptyState } from './reducer';
import { addMonthsToKey, daysInMonth, monthKey, round2, todayISO, uid } from '@/lib/utils';

/**
 * Generates a realistic 9-month ledger so the dashboards, forecasts and
 * insights have something to work with on a fresh install. Entirely optional —
 * Settings can wipe it and start clean.
 */

interface Template {
  merchant: string;
  category: string;
  subcategory?: string;
  min: number;
  max: number;
  mode: PaymentMode;
  /** Expected occurrences per month. */
  perMonth: number;
  account: 'salary' | 'card' | 'cash' | 'wallet';
  tags?: string[];
}

const TEMPLATES: Template[] = [
  { merchant: 'Swiggy', category: 'Food & Dining', subcategory: 'Food Delivery', min: 240, max: 780, mode: 'UPI', perMonth: 6, account: 'salary' },
  { merchant: 'Local Restaurant', category: 'Food & Dining', subcategory: 'Restaurant', min: 400, max: 2200, mode: 'Credit Card', perMonth: 3, account: 'card' },
  { merchant: 'Chai Point', category: 'Food & Dining', subcategory: 'Cafe', min: 40, max: 180, mode: 'UPI', perMonth: 8, account: 'salary' },
  { merchant: 'DMart', category: 'Grocery', subcategory: 'Supermarket', min: 1400, max: 4200, mode: 'Debit Card', perMonth: 2, account: 'salary' },
  { merchant: 'Blinkit', category: 'Grocery', subcategory: 'Online Grocery', min: 180, max: 900, mode: 'UPI', perMonth: 5, account: 'salary' },
  { merchant: 'Indian Oil', category: 'Fuel', subcategory: 'Petrol', min: 1500, max: 3000, mode: 'Credit Card', perMonth: 3, account: 'card' },
  { merchant: 'Uber', category: 'Travel', subcategory: 'Cab & Auto', min: 120, max: 640, mode: 'UPI', perMonth: 4, account: 'wallet' },
  { merchant: 'Amazon', category: 'Shopping', subcategory: 'Online Shopping', min: 500, max: 6500, mode: 'Credit Card', perMonth: 3, account: 'card' },
  { merchant: 'Myntra', category: 'Clothing', subcategory: 'Casual', min: 900, max: 4500, mode: 'Credit Card', perMonth: 1, account: 'card' },
  { merchant: 'BookMyShow', category: 'Movies & Entertainment', subcategory: 'Cinema', min: 300, max: 1400, mode: 'UPI', perMonth: 1, account: 'salary' },
  { merchant: 'Apollo Pharmacy', category: 'Healthcare', subcategory: 'Pharmacy', min: 180, max: 1600, mode: 'UPI', perMonth: 1, account: 'salary' },
  { merchant: 'Urban Company', category: 'Home Maintenance', subcategory: 'Cleaning', min: 500, max: 2500, mode: 'UPI', perMonth: 0.5, account: 'salary' },
  { merchant: 'Wine Shop', category: 'Liquor', subcategory: 'Wine Shop', min: 700, max: 2400, mode: 'Cash', perMonth: 1, account: 'cash' },
  { merchant: 'Salon Studio', category: 'Personal Care', subcategory: 'Salon', min: 300, max: 1200, mode: 'UPI', perMonth: 1, account: 'salary' },
  { merchant: 'Vegetable Market', category: 'Grocery', subcategory: 'Vegetables & Fruits', min: 200, max: 700, mode: 'Cash', perMonth: 4, account: 'cash' },
  { merchant: 'GoMechanic', category: 'Vehicle Maintenance', subcategory: 'Service', min: 1200, max: 6000, mode: 'Credit Card', perMonth: 0.25, account: 'card' },
  { merchant: 'Friends Outing', category: 'Friends & Social', subcategory: 'Outings', min: 500, max: 3000, mode: 'UPI', perMonth: 1.5, account: 'salary' },
  { merchant: 'Gift Shop', category: 'Gifts', subcategory: 'Birthday', min: 500, max: 3000, mode: 'UPI', perMonth: 0.5, account: 'salary' },
];

/** Charges that land on the same day every month. */
const FIXED: Array<Omit<Template, 'perMonth'> & { day: number; amount: number }> = [
  { merchant: 'Landlord', category: 'Rent/Housing', subcategory: 'House Rent', amount: 24000, day: 3, mode: 'Net Banking', min: 0, max: 0, account: 'salary' },
  { merchant: 'KSEB', category: 'Utilities', subcategory: 'Electricity', amount: 1850, day: 12, mode: 'UPI', min: 0, max: 0, account: 'salary' },
  { merchant: 'Airtel', category: 'Mobile & Internet', subcategory: 'Broadband', amount: 1199, day: 8, mode: 'UPI', min: 0, max: 0, account: 'salary' },
  { merchant: 'Jio', category: 'Mobile & Internet', subcategory: 'Mobile Recharge', amount: 349, day: 15, mode: 'UPI', min: 0, max: 0, account: 'salary' },
  { merchant: 'Netflix', category: 'Subscriptions', subcategory: 'OTT', amount: 649, day: 6, mode: 'Credit Card', min: 0, max: 0, account: 'card' },
  { merchant: 'Spotify', category: 'Subscriptions', subcategory: 'Music', amount: 149, day: 11, mode: 'Credit Card', min: 0, max: 0, account: 'card' },
  { merchant: 'Amazon Prime', category: 'Subscriptions', subcategory: 'OTT', amount: 299, day: 21, mode: 'Credit Card', min: 0, max: 0, account: 'card' },
  { merchant: 'Cult.fit', category: 'Subscriptions', subcategory: 'Fitness', amount: 1499, day: 5, mode: 'Credit Card', min: 0, max: 0, account: 'card' },
  { merchant: 'HDFC Home Loan', category: 'EMI/Loans', subcategory: 'Home Loan', amount: 28500, day: 5, mode: 'Net Banking', min: 0, max: 0, account: 'salary' },
  { merchant: 'Groww', category: 'Investments', subcategory: 'SIP / Mutual Fund', amount: 15000, day: 4, mode: 'Net Banking', min: 0, max: 0, account: 'salary' },
  { merchant: 'LIC', category: 'Insurance', subcategory: 'Life', amount: 3200, day: 18, mode: 'Net Banking', min: 0, max: 0, account: 'salary' },
];

/** Deterministic PRNG so the sample ledger is the same every time it is generated. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoState(today = todayISO()): AppState {
  const rnd = mulberry32(20260314);
  const base = emptyState();
  const now = new Date().toISOString();

  const salary = {
    id: uid('acc'), bankName: 'HDFC Bank', accountName: 'Salary Account', accountType: 'Savings' as const,
    last4: '4521', openingBalance: 180000, color: '#4C8DF6', createdAt: now,
  };
  const card = {
    id: uid('acc'), bankName: 'ICICI Bank', accountName: 'Amazon Pay Card', accountType: 'Credit Card' as const,
    last4: '7788', cardName: 'Amazon Pay ICICI', creditLimit: 250000, statementDay: 18, dueDay: 5,
    openingBalance: 0, color: '#E0842A', createdAt: now,
  };
  const cash = {
    id: uid('acc'), bankName: 'Cash', accountName: 'Wallet Cash', accountType: 'Cash' as const,
    last4: '0000', openingBalance: 12000, color: '#3FA07A', createdAt: now,
  };
  const wallet = {
    id: uid('acc'), bankName: 'Paytm', accountName: 'Paytm Wallet', accountType: 'Wallet' as const,
    last4: '9012', openingBalance: 4000, color: '#8B6FD6', createdAt: now,
  };
  const accountIds = { salary: salary.id, card: card.id, cash: cash.id, wallet: wallet.id };

  const months = Array.from({ length: 9 }, (_, i) => addMonthsToKey(monthKey(today), -(8 - i)));
  const txns: Transaction[] = [];
  const currentDay = Number(today.slice(8, 10));

  const push = (
    month: string, day: number, over: Partial<Transaction> & Pick<Transaction, 'amount' | 'merchant' | 'category' | 'paymentMode'>,
  ) => {
    const maxDay = month === monthKey(today) ? currentDay : daysInMonth(month);
    if (day > maxDay) return;
    const date = `${month}-${String(Math.max(1, day)).padStart(2, '0')}`;
    txns.push({
      id: uid('txn'), kind: 'expense', date, tags: [], attachmentIds: [], source: 'manual',
      createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`, ...over,
    });
  };

  months.forEach((month, monthIndex) => {
    // Income: a salary that steps up mid-way, plus occasional extras.
    const salaryAmount = monthIndex < 5 ? 118000 : 132000;
    push(month, 1, {
      kind: 'income', amount: salaryAmount, merchant: 'Acme Technologies', category: 'Salary',
      subcategory: 'Monthly Salary', paymentMode: 'Net Banking', accountId: accountIds.salary,
      remarks: 'Monthly credit',
    });
    if (monthIndex === 3) {
      push(month, 14, {
        kind: 'income', amount: 85000, merchant: 'Acme Technologies', category: 'Bonus',
        subcategory: 'Annual Bonus', paymentMode: 'Net Banking', accountId: accountIds.salary,
      });
    }
    if (monthIndex % 3 === 2) {
      push(month, 22, {
        kind: 'income', amount: round2(12000 + rnd() * 18000), merchant: 'Freelance Client',
        category: 'Freelancing', subcategory: 'Consulting', paymentMode: 'Net Banking', accountId: accountIds.salary,
      });
    }
    push(month, 26, {
      kind: 'income', amount: round2(320 + rnd() * 260), merchant: 'HDFC Bank', category: 'Interest Income',
      subcategory: 'Savings Interest', paymentMode: 'Net Banking', accountId: accountIds.salary,
    });

    for (const f of FIXED) {
      push(month, f.day, {
        amount: f.amount, merchant: f.merchant, category: f.category, subcategory: f.subcategory,
        paymentMode: f.mode, accountId: accountIds[f.account],
        tags: f.category === 'Subscriptions' ? ['recurring'] : [],
      });
    }

    // Spending drifts up gently over time — enough for the trend engines to see.
    const drift = 1 + monthIndex * 0.02;
    // A festive spike two months back, so seasonality has something to find.
    const festive = monthIndex === months.length - 3 ? 1.5 : 1;

    for (const t of TEMPLATES) {
      const expected = t.perMonth * drift * festive;
      const count = Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rnd() * daysInMonth(month));
        push(month, day, {
          amount: round2((t.min + rnd() * (t.max - t.min)) * drift),
          merchant: t.merchant, category: t.category, subcategory: t.subcategory,
          paymentMode: t.mode, accountId: accountIds[t.account], tags: t.tags ?? [],
        });
      }
    }

    // Credit card bill paid from the salary account.
    if (monthIndex > 0) {
      const prev = months[monthIndex - 1];
      const cardSpend = txns
        .filter((t) => t.accountId === accountIds.card && monthKey(t.date) === prev && t.kind === 'expense')
        .reduce((a, t) => a + t.amount, 0);
      if (cardSpend > 0) {
        // Two legs of one transfer: out of the salary account, into the card.
        // Categorised as Transfers so it settles the balance without being
        // counted again as spending.
        push(month, 5, {
          amount: round2(cardSpend), merchant: 'ICICI Credit Card', category: 'Transfers',
          subcategory: 'Credit Card Bill Payment', paymentMode: 'Net Banking', accountId: accountIds.salary,
          remarks: `Card bill for ${prev}`, tags: ['card-settlement'],
        });
        push(month, 5, {
          kind: 'income', amount: round2(cardSpend), merchant: 'Card Payment Received', category: 'Transfers',
          subcategory: 'Credit Card Bill Payment', paymentMode: 'Net Banking', accountId: accountIds.card,
          remarks: `Statement settlement for ${prev}`, tags: ['card-settlement'],
        });
      }
    }
  });

  const thisMonth = monthKey(today);
  const budgets: Budget[] = [
    { id: uid('bud'), category: 'ALL', period: 'monthly', amount: 105000, effectiveFrom: addMonthsToKey(thisMonth, -8), createdAt: now },
    { id: uid('bud'), category: 'Food & Dining', period: 'monthly', amount: 8000, effectiveFrom: addMonthsToKey(thisMonth, -8), createdAt: now },
    { id: uid('bud'), category: 'Grocery', period: 'monthly', amount: 10000, effectiveFrom: addMonthsToKey(thisMonth, -8), createdAt: now },
    { id: uid('bud'), category: 'Fuel', period: 'monthly', amount: 5000, effectiveFrom: addMonthsToKey(thisMonth, -8), createdAt: now },
    { id: uid('bud'), category: 'Shopping', period: 'monthly', amount: 6000, effectiveFrom: addMonthsToKey(thisMonth, -8), createdAt: now },
    { id: uid('bud'), category: 'Movies & Entertainment', period: 'monthly', amount: 2000, effectiveFrom: addMonthsToKey(thisMonth, -8), createdAt: now },
    { id: uid('bud'), category: 'ALL', period: 'annual', amount: 1300000, effectiveFrom: `${today.slice(0, 4)}-01`, createdAt: now },
  ];

  const goals: Goal[] = [
    {
      id: uid('goal'), name: 'Emergency Fund', type: 'Emergency Fund', targetAmount: 600000,
      currentAmount: 385000, monthlyContribution: 20000, createdAt: now,
      note: 'Six months of expenses held in a liquid fund.',
      contributions: [
        { id: uid('c'), date: `${addMonthsToKey(thisMonth, -2)}-05`, amount: 20000 },
        { id: uid('c'), date: `${addMonthsToKey(thisMonth, -1)}-05`, amount: 20000 },
      ],
    },
    {
      id: uid('goal'), name: 'Japan Trip', type: 'Vacation', targetAmount: 350000, currentAmount: 96000,
      monthlyContribution: 15000, targetDate: `${Number(today.slice(0, 4)) + 1}-04-30`, createdAt: now,
      note: 'Two weeks, cherry blossom season.', contributions: [],
    },
    {
      id: uid('goal'), name: 'New Car', type: 'New Vehicle', targetAmount: 1200000, currentAmount: 240000,
      monthlyContribution: 25000, createdAt: now, contributions: [],
    },
  ];

  return {
    ...base,
    accounts: [salary, card, cash, wallet],
    transactions: txns.sort((a, b) => b.date.localeCompare(a.date)),
    budgets,
    goals,
    // Flagged as sample data, so the app can label it and offer to clear it.
    settings: { ...base.settings, onboarded: true, demoLoadedAt: new Date().toISOString() },
  };
}

/** A few unreviewed messages, so the approval queue is not empty on a demo install. */
export const DEMO_MESSAGES: Array<{ text: string; source: 'sms' | 'upi' | 'whatsapp' | 'bank' }> = [
  { text: 'Rs.1,299.00 debited from A/c XX4521 on {d1} to SWIGGY via UPI Ref 402913887766. Avl Bal Rs.42,118.90 -HDFC Bank', source: 'bank' },
  { text: 'Paid ₹2,500 for fuel through HDFC Credit Card', source: 'whatsapp' },
  { text: 'INR 649 spent on ICICI Credit Card XX7788 at NETFLIX on {d2}. Not you? Call 18001080.', source: 'sms' },
  { text: 'You have paid Rs 340 to ramesh.stores@okaxis via UPI. UPI Ref 512338890021', source: 'upi' },
  { text: 'Bought groceries worth ₹1,850 at DMart yesterday', source: 'whatsapp' },
];
