import type { CategoryDef, PaymentMode, AccountType } from '@/types';

export const PAYMENT_MODES: PaymentMode[] = [
  'UPI',
  'Credit Card',
  'Debit Card',
  'Cash',
  'Net Banking',
  'Wallet',
];

export const ACCOUNT_TYPES: AccountType[] = [
  'Savings',
  'Current',
  'Credit Card',
  'Wallet',
  'Cash',
  'Loan',
];

/** Expense categories with sensible starter subcategories. Users may add their own. */
export const EXPENSE_CATEGORIES: CategoryDef[] = [
  { name: 'Food & Dining', kind: 'expense', subcategories: ['Restaurant', 'Food Delivery', 'Cafe', 'Snacks', 'Office Lunch', 'Sweets'] },
  { name: 'Grocery', kind: 'expense', subcategories: ['Supermarket', 'Vegetables & Fruits', 'Dairy', 'Meat & Fish', 'Provisions', 'Online Grocery'] },
  { name: 'Fuel', kind: 'expense', subcategories: ['Petrol', 'Diesel', 'CNG', 'EV Charging'] },
  { name: 'Family', kind: 'expense', subcategories: ['Parents', 'Spouse', 'Children', 'Household Help', 'Family Events'] },
  { name: 'Friends & Social', kind: 'expense', subcategories: ['Outings', 'Party', 'Split Settlement', 'Lending'] },
  { name: 'Luxury Purchases', kind: 'expense', subcategories: ['Watches', 'Jewellery', 'Gadgets', 'Premium Brands'] },
  { name: 'Movies & Entertainment', kind: 'expense', subcategories: ['Cinema', 'OTT', 'Events & Concerts', 'Gaming', 'Sports'] },
  { name: 'Liquor', kind: 'expense', subcategories: ['Wine Shop', 'Bar & Pub', 'Beer'] },
  { name: 'Education', kind: 'expense', subcategories: ['Tuition Fees', 'Books', 'Online Courses', 'Exam Fees', 'Coaching'] },
  { name: 'Healthcare', kind: 'expense', subcategories: ['Doctor Consultation', 'Pharmacy', 'Diagnostics', 'Hospital', 'Dental', 'Therapy'] },
  { name: 'Travel', kind: 'expense', subcategories: ['Flight', 'Train', 'Bus', 'Cab & Auto', 'Hotel', 'Tolls & Parking', 'Holiday Package'] },
  { name: 'Shopping', kind: 'expense', subcategories: ['Electronics', 'Home & Kitchen', 'Footwear', 'Accessories', 'Online Shopping'] },
  { name: 'Utilities', kind: 'expense', subcategories: ['Electricity', 'Water', 'Gas', 'Maintenance Charges', 'Waste Management'] },
  { name: 'Mobile & Internet', kind: 'expense', subcategories: ['Mobile Recharge', 'Postpaid Bill', 'Broadband', 'DTH'] },
  { name: 'Rent/Housing', kind: 'expense', subcategories: ['House Rent', 'Society Fees', 'Brokerage', 'Deposit'] },
  { name: 'Insurance', kind: 'expense', subcategories: ['Life', 'Health', 'Vehicle', 'Term', 'Travel Insurance'] },
  { name: 'Investments', kind: 'expense', subcategories: ['SIP / Mutual Fund', 'Stocks', 'PPF', 'NPS', 'Gold', 'Fixed Deposit', 'Crypto'] },
  { name: 'EMI/Loans', kind: 'expense', subcategories: ['Home Loan', 'Car Loan', 'Personal Loan', 'Education Loan', 'Credit Card Bill', 'Gold Loan'] },
  { name: 'Subscriptions', kind: 'expense', subcategories: ['OTT', 'Music', 'Cloud & Software', 'News', 'Fitness', 'Membership'] },
  { name: 'Clothing', kind: 'expense', subcategories: ['Casual', 'Formal', 'Ethnic', 'Kids', 'Tailoring'] },
  { name: 'Personal Care', kind: 'expense', subcategories: ['Salon', 'Cosmetics', 'Spa', 'Grooming'] },
  { name: 'Gifts', kind: 'expense', subcategories: ['Birthday', 'Wedding', 'Festival', 'Anniversary'] },
  { name: 'Donations', kind: 'expense', subcategories: ['Temple / Church', 'Charity', 'NGO', 'Crowdfunding'] },
  { name: 'Vehicle Maintenance', kind: 'expense', subcategories: ['Service', 'Repairs', 'Spare Parts', 'Car Wash', 'Accessories'] },
  { name: 'Home Maintenance', kind: 'expense', subcategories: ['Repairs', 'Plumbing', 'Electrical', 'Painting', 'Appliance Service', 'Cleaning'] },
  { name: 'Other', kind: 'expense', subcategories: ['Miscellaneous', 'Fees & Charges', 'Fines', 'Cash Withdrawal'] },
  { name: 'Transfers', kind: 'expense', subcategories: ['Credit Card Bill Payment', 'Between My Accounts', 'Wallet Top-up', 'Goal Funding'] },
];

export const INCOME_CATEGORIES: CategoryDef[] = [
  { name: 'Salary', kind: 'income', subcategories: ['Monthly Salary', 'Arrears', 'Reimbursement'] },
  { name: 'Bonus', kind: 'income', subcategories: ['Annual Bonus', 'Festival Bonus', 'Joining Bonus'] },
  { name: 'Incentives', kind: 'income', subcategories: ['Performance Incentive', 'Sales Commission', 'Referral'] },
  { name: 'Freelancing', kind: 'income', subcategories: ['Consulting', 'Project Work', 'Content'] },
  { name: 'Interest Income', kind: 'income', subcategories: ['Savings Interest', 'FD Interest', 'Bond Interest'] },
  { name: 'Rental Income', kind: 'income', subcategories: ['House Rent', 'Commercial Rent', 'Vehicle Rent'] },
  { name: 'Investment Gains', kind: 'income', subcategories: ['Dividend', 'Capital Gains', 'Mutual Fund Redemption', 'Crypto Gains'] },
  { name: 'Refunds', kind: 'income', subcategories: ['Purchase Refund', 'Tax Refund', 'Cashback', 'Insurance Claim'] },
  { name: 'Other Income', kind: 'income', subcategories: ['Gift Received', 'Lottery', 'Miscellaneous'] },
  { name: 'Transfers', kind: 'income', subcategories: ['Credit Card Bill Payment', 'Between My Accounts', 'Wallet Top-up', 'Goal Funding'] },
];

export const DEFAULT_CATEGORIES: CategoryDef[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

/** Income categories that repeat every month by nature — used by the recurring-income view. */
export const RECURRING_INCOME_CATEGORIES = ['Salary', 'Rental Income', 'Interest Income'];

/** Categories that are transfers of wealth rather than consumption. Excluded from "spend". */
export const SAVINGS_LIKE_CATEGORIES = ['Investments'];

/**
 * Money moving between the user's own accounts — a credit card bill payment, a
 * wallet top-up, cash withdrawn from an ATM into the cash account. These change
 * account balances but are neither income nor expenditure, so counting them
 * would double-count the original purchase.
 */
export const TRANSFER_CATEGORIES = ['Transfers'];

/** Categories the insight engine treats as discretionary / trimmable. */
export const DISCRETIONARY_CATEGORIES = [
  'Food & Dining',
  'Friends & Social',
  'Luxury Purchases',
  'Movies & Entertainment',
  'Liquor',
  'Shopping',
  'Subscriptions',
  'Clothing',
  'Personal Care',
  'Gifts',
];

/** Non-negotiable monthly commitments, used for the fixed-vs-variable split. */
export const ESSENTIAL_CATEGORIES = [
  'Grocery',
  'Rent/Housing',
  'Utilities',
  'Mobile & Internet',
  'Healthcare',
  'Education',
  'Insurance',
  'EMI/Loans',
  'Fuel',
];

export const GOAL_TYPES = [
  'Emergency Fund',
  'New Vehicle',
  'Home Purchase',
  'Vacation',
  'Education Fund',
  'Retirement Fund',
  'Wedding',
  'Gadget',
  'Other',
];
