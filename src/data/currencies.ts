/** Currencies the app offers. INR is the default for a reason: it is home. */
export interface CurrencyDef {
  code: string;
  name: string;
  symbol: string;
  /** Minor units — JPY has none, most have two. */
  digits: number;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', digits: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', digits: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', digits: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', digits: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', digits: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', digits: 2 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', digits: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', digits: 3 },
  { code: 'OMR', name: 'Omani Rial', symbol: '﷼', digits: 3 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب', digits: 3 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', digits: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', digits: 2 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', digits: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', digits: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', digits: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', digits: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', digits: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', digits: 0 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', digits: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', digits: 2 },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', digits: 2 },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs', digits: 2 },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', digits: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', digits: 2 },
  { code: 'RUB', name: 'Russian Rouble', symbol: '₽', digits: 2 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', digits: 2 },
];

export const DEFAULT_CURRENCY = 'INR';

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currency(code: string): CurrencyDef {
  return BY_CODE.get(code) ?? { code, name: code, symbol: code, digits: 2 };
}

export function isKnownCurrency(code: string): boolean {
  return BY_CODE.has(code);
}
