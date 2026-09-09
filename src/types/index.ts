/** Core domain model for the personal finance app. All money values are in INR (rupees, 2dp). */

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // full ISO timestamp

export type PaymentMode =
  | 'Debit Card'
  | 'Credit Card'
  | 'UPI'
  | 'Cash'
  | 'Net Banking'
  | 'Wallet';

export type AccountType =
  | 'Savings'
  | 'Current'
  | 'Credit Card'
  | 'Wallet'
  | 'Cash'
  | 'Loan';

export type TxnKind = 'expense' | 'income';

/** Where an entry originated. Anything not 'manual' must pass through approval. */
export type CaptureSource = 'manual' | 'sms' | 'upi' | 'whatsapp' | 'bank' | 'text' | 'receipt';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Account {
  id: string;
  bankName: string;
  accountName: string;
  accountType: AccountType;
  /** Only the last 4 digits are ever stored or displayed. */
  last4: string;
  cardName?: string;
  creditLimit?: number;
  /** Day of month (1-31) the card statement is generated. */
  statementDay?: number;
  /** Day of month (1-31) the payment is due. */
  dueDay?: number;
  openingBalance: number;
  color?: string;
  archived?: boolean;
  createdAt: ISODateTime;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: ISODateTime;
}

/**
 * What a transaction looked like in the currency it was actually paid in.
 *
 * Kept alongside the converted figure rather than instead of it: reports have
 * to stay stable, and a rate that moves next week must not silently rewrite
 * what last month cost.
 */
export interface OriginalAmount {
  amount: number;
  currency: string;
  /** Units of the home currency per one unit of `currency`, at entry time. */
  rate: number;
  /** When that rate was captured. */
  rateAt: ISODateTime;
  /** Where the rate came from, so a reader knows how much to trust it. */
  rateSource: 'live' | 'manual' | 'same';
}

/** A posted transaction in the ledger. Only approved items ever become one. */
export interface Transaction {
  id: string;
  kind: TxnKind;
  date: ISODate;
  /**
   * Always in the user's home currency — every total, budget and forecast
   * reads this, so it must be one comparable unit.
   */
  amount: number;
  /** Present only when the money was actually spent in another currency. */
  original?: OriginalAmount;
  merchant: string;
  category: string;
  subcategory?: string;
  paymentMode: PaymentMode;
  accountId?: string;
  remarks?: string;
  tags: string[];
  attachmentIds: string[];
  location?: string;
  source: CaptureSource;
  /** Set when the row came from the approval queue. */
  originId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** AI-extracted field with its own confidence, so the UI can highlight weak guesses. */
export interface FieldGuess<T> {
  value: T;
  confidence: number; // 0..1
  evidence?: string;
}

export interface ExtractionResult {
  kind: TxnKind;
  amount: FieldGuess<number | null>;
  date: FieldGuess<ISODate>;
  merchant: FieldGuess<string>;
  category: FieldGuess<string>;
  subcategory?: FieldGuess<string>;
  paymentMode: FieldGuess<PaymentMode>;
  bank: FieldGuess<string | null>;
  last4: FieldGuess<string | null>;
  location: FieldGuess<string | null>;
  /** Aggregate confidence 0..1 across the fields that matter. */
  confidence: number;
  /** Human-readable notes on how the engine reached its answer. */
  reasons: string[];
  /** True when the text does not look like a financial transaction at all. */
  isTransaction: boolean;
}

/** An item awaiting the mandatory human review before it can post to the ledger. */
export interface PendingItem {
  id: string;
  rawText: string;
  source: CaptureSource;
  receivedAt: ISODateTime;
  extraction: ExtractionResult;
  /** User edits applied in the review screen, merged over the extraction on approve. */
  draft: PendingDraft;
  status: ApprovalStatus;
  attachmentIds: string[];
  reviewedAt?: ISODateTime;
  rejectionReason?: string;
  /** Ledger transaction created on approval. */
  postedTransactionId?: string;
  /**
   * Other captures folded into this one — the confirmation email for a card
   * SMS, say. Kept whole so the reviewer can read what corroborated what.
   */
  corroboration?: Corroboration[];
  /** Set when this capture resembles something already captured or posted. */
  possibleDuplicateOf?: DuplicateHint;
}

/** A second message describing the same spend as the capture it is attached to. */
export interface Corroboration {
  source: CaptureSource;
  receivedAt: ISODateTime;
  rawText: string;
}

/** A resemblance the engine would not act on alone, left for the reviewer to judge. */
export interface DuplicateHint {
  pendingId?: string;
  transactionId?: string;
  /** Why the engine thinks so, in the reviewer's language. */
  reason: string;
}

export interface PendingDraft {
  kind: TxnKind;
  date: ISODate;
  amount: number;
  original?: OriginalAmount;
  merchant: string;
  category: string;
  subcategory?: string;
  paymentMode: PaymentMode;
  accountId?: string;
  remarks?: string;
  tags: string[];
  location?: string;
}

export type BudgetPeriod = 'monthly' | 'quarterly' | 'annual';

export interface Budget {
  id: string;
  /** 'ALL' means the overall budget for the period; otherwise a category name. */
  category: string | 'ALL';
  period: BudgetPeriod;
  amount: number;
  /** Period this budget starts applying from, e.g. '2026-04'. */
  effectiveFrom: string;
  createdAt: ISODateTime;
}

export interface Goal {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: ISODate;
  /** Planned monthly contribution, used to project the completion date. */
  monthlyContribution?: number;
  note?: string;
  createdAt: ISODateTime;
  contributions: GoalContribution[];
}

export interface GoalContribution {
  id: string;
  date: ISODate;
  amount: number;
  note?: string;
}

export interface RecurringRule {
  id: string;
  kind: TxnKind;
  label: string;
  amount: number;
  category: string;
  paymentMode: PaymentMode;
  accountId?: string;
  /** Day of month the entry recurs. A day past the month's end lands on its last day. */
  dayOfMonth: number;
  merchant: string;
  subcategory?: string;
  remarks?: string;
  active: boolean;
  /** Latest month ('YYYY-MM') an entry was generated for, so it happens once. */
  lastGeneratedMonth?: string;
  createdAt: ISODateTime;
}

export interface CategoryDef {
  name: string;
  subcategories: string[];
  custom?: boolean;
  kind: TxnKind;
}

/** Every consequential change is recorded, so the ledger can always be explained. */
export type AuditAction =
  | 'txn.create' | 'txn.update' | 'txn.delete' | 'txn.restore' | 'txn.purge'
  | 'pending.capture' | 'pending.approve' | 'pending.reject' | 'pending.delete' | 'pending.restore'
  | 'pending.edit' | 'pending.clearReviewed' | 'pending.crossReference'
  | 'account.create' | 'account.update' | 'account.delete'
  | 'budget.set' | 'budget.delete'
  | 'goal.create' | 'goal.update' | 'goal.delete' | 'goal.contribute'
  | 'recurring.set' | 'recurring.delete'
  | 'category.add' | 'category.addSub' | 'category.remove'
  | 'settings.update' | 'data.import' | 'data.reset' | 'recycle.purgeExpired';

export interface AuditEntry {
  id: string;
  at: ISODateTime;
  action: AuditAction;
  /** Id of the thing that changed, where there is one. */
  entityId?: string;
  /** One line, written for a person reading their own history. */
  summary: string;
  /** Field-level changes, for edits. */
  changes?: Array<{ field: string; from: string; to: string }>;
  amount?: number;
  /** True while the change can still be undone from the recycle bin. */
  recoverable?: boolean;
}

/** A soft-deleted record, held for the retention window before it is really gone. */
export interface DeletedItem {
  id: string;
  kind: 'transaction' | 'pending';
  deletedAt: ISODateTime;
  /** After this instant the item is purged automatically. */
  expiresAt: ISODateTime;
  reason?: string;
  transaction?: Transaction;
  pending?: PendingItem;
}

/** Cached conversion rates, expressed per one unit of the home currency. */
export interface RateTable {
  base: string;
  /** code -> units of that currency per 1 unit of base. */
  rates: Record<string, number>;
  fetchedAt: ISODateTime;
  source: string;
}

export interface Settings {
  theme: 'light' | 'dark';
  /** The currency every total, budget and report is expressed in. */
  currency: string;
  /** Fetch conversion rates from the internet. Off unless the user turns it on. */
  liveRates: boolean;
  /** Last rates fetched, kept so conversion still works offline. */
  rateTable?: RateTable;
  locale: string;
  monthStartDay: number;
  /** Budget alert thresholds as percentages. */
  alertThresholds: number[];
  /** Emergency-fund target expressed as months of average expense. */
  emergencyFundMonths: number;
  /** Days a deleted record stays recoverable in the recycle bin. */
  retentionDays: number;
  /** Ask before anything destructive. Off only if the user turns it off. */
  confirmDestructive: boolean;
  autoApproveThreshold: number | null; // reserved; approval stays mandatory
  /** False until the first-run tutorial has been seen or skipped. */
  onboarded: boolean;
  /** Set while the ledger holds sample data, so it can be labelled and cleared. */
  demoLoadedAt?: ISODateTime;
}

export interface AppState {
  version: number;
  accounts: Account[];
  transactions: Transaction[];
  pending: PendingItem[];
  budgets: Budget[];
  goals: Goal[];
  recurring: RecurringRule[];
  categories: CategoryDef[];
  /** Append-only history of every consequential change, newest first. */
  audit: AuditEntry[];
  /** Soft-deleted records awaiting restore or automatic purge. */
  recycleBin: DeletedItem[];
  settings: Settings;
}
