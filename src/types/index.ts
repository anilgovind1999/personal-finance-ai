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

/** A posted transaction in the ledger. Only approved items ever become one. */
export interface Transaction {
  id: string;
  kind: TxnKind;
  date: ISODate;
  amount: number;
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
}

export interface PendingDraft {
  kind: TxnKind;
  date: ISODate;
  amount: number;
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
  /** Day of month the entry recurs. */
  dayOfMonth: number;
  active: boolean;
  createdAt: ISODateTime;
}

export interface CategoryDef {
  name: string;
  subcategories: string[];
  custom?: boolean;
  kind: TxnKind;
}

export interface Settings {
  theme: 'light' | 'dark';
  currency: string;
  locale: string;
  monthStartDay: number;
  /** Budget alert thresholds as percentages. */
  alertThresholds: number[];
  /** Emergency-fund target expressed as months of average expense. */
  emergencyFundMonths: number;
  autoApproveThreshold: number | null; // reserved; approval stays mandatory
  onboarded: boolean;
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
  settings: Settings;
}
