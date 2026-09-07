import type { PaymentMode } from '@/types';

export interface MerchantEntry {
  /** Canonical display name. */
  name: string;
  /** Lower-case tokens/phrases that identify the merchant in raw text. */
  aliases: string[];
  category: string;
  subcategory?: string;
}

/** Indian retail-banking names as they appear in SMS alerts. */
export interface BankEntry {
  name: string;
  aliases: string[];
}

export const BANKS: BankEntry[] = [
  { name: 'HDFC Bank', aliases: ['hdfc', 'hdfcbank', 'hdfc bk'] },
  { name: 'ICICI Bank', aliases: ['icici', 'icicibank', 'icici bk'] },
  { name: 'State Bank of India', aliases: ['sbi', 'state bank', 'sbicard', 'sbi card'] },
  { name: 'Axis Bank', aliases: ['axis', 'axisbank'] },
  { name: 'Kotak Mahindra Bank', aliases: ['kotak', 'kotak mahindra'] },
  { name: 'Yes Bank', aliases: ['yes bank', 'yesbank'] },
  { name: 'IndusInd Bank', aliases: ['indusind', 'indus ind'] },
  { name: 'IDFC First Bank', aliases: ['idfc', 'idfc first'] },
  { name: 'Punjab National Bank', aliases: ['pnb', 'punjab national'] },
  { name: 'Bank of Baroda', aliases: ['bob', 'bank of baroda', 'baroda'] },
  { name: 'Canara Bank', aliases: ['canara'] },
  { name: 'Union Bank of India', aliases: ['union bank'] },
  { name: 'Federal Bank', aliases: ['federal bank', 'federal'] },
  { name: 'South Indian Bank', aliases: ['south indian bank', 'sib'] },
  { name: 'RBL Bank', aliases: ['rbl'] },
  { name: 'AU Small Finance Bank', aliases: ['au bank', 'au small finance'] },
  { name: 'Bandhan Bank', aliases: ['bandhan'] },
  { name: 'IDBI Bank', aliases: ['idbi'] },
  { name: 'Indian Bank', aliases: ['indian bank'] },
  { name: 'Central Bank of India', aliases: ['central bank'] },
  { name: 'American Express', aliases: ['amex', 'american express'] },
  { name: 'Citibank', aliases: ['citi', 'citibank'] },
  { name: 'Standard Chartered', aliases: ['standard chartered', 'stanchart', 'scb'] },
  { name: 'HSBC', aliases: ['hsbc'] },
];

/** Wallet brands recognised as payment mode 'Wallet'. */
export const WALLETS = ['paytm wallet', 'phonepe wallet', 'amazon pay balance', 'mobikwik', 'freecharge', 'ola money', 'jio money', 'airtel money'];

/** Merchant dictionary. Aliases are matched case-insensitively on word boundaries. */
export const MERCHANTS: MerchantEntry[] = [
  // Food & Dining
  { name: 'Swiggy', aliases: ['swiggy'], category: 'Food & Dining', subcategory: 'Food Delivery' },
  { name: 'Zomato', aliases: ['zomato'], category: 'Food & Dining', subcategory: 'Food Delivery' },
  { name: 'Zepto Cafe', aliases: ['zepto cafe'], category: 'Food & Dining', subcategory: 'Cafe' },
  { name: "Domino's Pizza", aliases: ['dominos', "domino's", 'domino'], category: 'Food & Dining', subcategory: 'Restaurant' },
  { name: 'Pizza Hut', aliases: ['pizza hut', 'pizzahut'], category: 'Food & Dining', subcategory: 'Restaurant' },
  { name: "McDonald's", aliases: ['mcdonald', 'mcdonalds', 'mcd'], category: 'Food & Dining', subcategory: 'Restaurant' },
  { name: 'KFC', aliases: ['kfc'], category: 'Food & Dining', subcategory: 'Restaurant' },
  { name: 'Burger King', aliases: ['burger king', 'burgerking'], category: 'Food & Dining', subcategory: 'Restaurant' },
  { name: 'Subway', aliases: ['subway'], category: 'Food & Dining', subcategory: 'Restaurant' },
  { name: 'Starbucks', aliases: ['starbucks'], category: 'Food & Dining', subcategory: 'Cafe' },
  { name: 'Cafe Coffee Day', aliases: ['ccd', 'cafe coffee day'], category: 'Food & Dining', subcategory: 'Cafe' },
  { name: 'Third Wave Coffee', aliases: ['third wave'], category: 'Food & Dining', subcategory: 'Cafe' },
  { name: 'Chaayos', aliases: ['chaayos'], category: 'Food & Dining', subcategory: 'Cafe' },
  { name: 'Barbeque Nation', aliases: ['barbeque nation', 'bbq nation'], category: 'Food & Dining', subcategory: 'Restaurant' },
  { name: 'Haldirams', aliases: ['haldiram', 'haldirams'], category: 'Food & Dining', subcategory: 'Sweets' },
  { name: 'EatSure', aliases: ['eatsure', 'faasos', 'behrouz', 'ovenstory'], category: 'Food & Dining', subcategory: 'Food Delivery' },
  { name: 'Box8', aliases: ['box8'], category: 'Food & Dining', subcategory: 'Food Delivery' },

  // Grocery
  { name: 'Blinkit', aliases: ['blinkit', 'grofers'], category: 'Grocery', subcategory: 'Online Grocery' },
  { name: 'Zepto', aliases: ['zepto'], category: 'Grocery', subcategory: 'Online Grocery' },
  { name: 'BigBasket', aliases: ['bigbasket', 'big basket', 'bbdaily'], category: 'Grocery', subcategory: 'Online Grocery' },
  { name: 'Instamart', aliases: ['instamart', 'swiggy instamart'], category: 'Grocery', subcategory: 'Online Grocery' },
  { name: 'DMart', aliases: ['dmart', 'd mart', 'avenue supermarts'], category: 'Grocery', subcategory: 'Supermarket' },
  { name: 'Reliance Fresh', aliases: ['reliance fresh', 'reliance smart'], category: 'Grocery', subcategory: 'Supermarket' },
  { name: "More Supermarket", aliases: ['more supermarket', 'more megastore'], category: 'Grocery', subcategory: 'Supermarket' },
  { name: 'Spencers', aliases: ['spencer', 'spencers'], category: 'Grocery', subcategory: 'Supermarket' },
  { name: 'Licious', aliases: ['licious'], category: 'Grocery', subcategory: 'Meat & Fish' },
  { name: 'Country Delight', aliases: ['country delight'], category: 'Grocery', subcategory: 'Dairy' },

  // Fuel
  { name: 'Indian Oil', aliases: ['indian oil', 'indianoil', 'iocl'], category: 'Fuel', subcategory: 'Petrol' },
  { name: 'Bharat Petroleum', aliases: ['bharat petroleum', 'bpcl', 'bharatpetro'], category: 'Fuel', subcategory: 'Petrol' },
  { name: 'Hindustan Petroleum', aliases: ['hindustan petroleum', 'hpcl', 'hp petrol'], category: 'Fuel', subcategory: 'Petrol' },
  { name: 'Shell', aliases: ['shell petrol', 'shell fuel'], category: 'Fuel', subcategory: 'Petrol' },
  { name: 'Nayara Energy', aliases: ['nayara', 'essar petrol'], category: 'Fuel', subcategory: 'Petrol' },

  // Travel
  { name: 'Uber', aliases: ['uber'], category: 'Travel', subcategory: 'Cab & Auto' },
  { name: 'Ola', aliases: ['ola cabs', 'olacabs', 'ola'], category: 'Travel', subcategory: 'Cab & Auto' },
  { name: 'Rapido', aliases: ['rapido'], category: 'Travel', subcategory: 'Cab & Auto' },
  { name: 'IRCTC', aliases: ['irctc', 'indian railway'], category: 'Travel', subcategory: 'Train' },
  { name: 'MakeMyTrip', aliases: ['makemytrip', 'mmt'], category: 'Travel', subcategory: 'Holiday Package' },
  { name: 'Goibibo', aliases: ['goibibo'], category: 'Travel', subcategory: 'Flight' },
  { name: 'Cleartrip', aliases: ['cleartrip'], category: 'Travel', subcategory: 'Flight' },
  { name: 'IndiGo', aliases: ['indigo airlines', 'goindigo', '6e'], category: 'Travel', subcategory: 'Flight' },
  { name: 'Air India', aliases: ['air india', 'airindia'], category: 'Travel', subcategory: 'Flight' },
  { name: 'RedBus', aliases: ['redbus'], category: 'Travel', subcategory: 'Bus' },
  { name: 'OYO', aliases: ['oyo'], category: 'Travel', subcategory: 'Hotel' },
  { name: 'Airbnb', aliases: ['airbnb'], category: 'Travel', subcategory: 'Hotel' },
  { name: 'FASTag', aliases: ['fastag', 'netc', 'toll plaza'], category: 'Travel', subcategory: 'Tolls & Parking' },

  // Shopping
  { name: 'Amazon', aliases: ['amazon', 'amzn'], category: 'Shopping', subcategory: 'Online Shopping' },
  { name: 'Flipkart', aliases: ['flipkart'], category: 'Shopping', subcategory: 'Online Shopping' },
  { name: 'Myntra', aliases: ['myntra'], category: 'Clothing', subcategory: 'Casual' },
  { name: 'Ajio', aliases: ['ajio'], category: 'Clothing', subcategory: 'Casual' },
  { name: 'Meesho', aliases: ['meesho'], category: 'Shopping', subcategory: 'Online Shopping' },
  { name: 'Nykaa', aliases: ['nykaa'], category: 'Personal Care', subcategory: 'Cosmetics' },
  { name: 'Croma', aliases: ['croma'], category: 'Shopping', subcategory: 'Electronics' },
  { name: 'Reliance Digital', aliases: ['reliance digital'], category: 'Shopping', subcategory: 'Electronics' },
  { name: 'IKEA', aliases: ['ikea'], category: 'Shopping', subcategory: 'Home & Kitchen' },
  { name: 'Decathlon', aliases: ['decathlon'], category: 'Shopping', subcategory: 'Accessories' },
  { name: 'Lifestyle', aliases: ['lifestyle stores'], category: 'Clothing', subcategory: 'Casual' },
  { name: 'Zudio', aliases: ['zudio'], category: 'Clothing', subcategory: 'Casual' },
  { name: 'Westside', aliases: ['westside'], category: 'Clothing', subcategory: 'Casual' },
  { name: 'Bata', aliases: ['bata'], category: 'Clothing', subcategory: 'Footwear' },

  // Entertainment & subscriptions
  { name: 'BookMyShow', aliases: ['bookmyshow', 'bms'], category: 'Movies & Entertainment', subcategory: 'Cinema' },
  { name: 'PVR INOX', aliases: ['pvr', 'inox', 'pvr inox'], category: 'Movies & Entertainment', subcategory: 'Cinema' },
  { name: 'Netflix', aliases: ['netflix'], category: 'Subscriptions', subcategory: 'OTT' },
  { name: 'Amazon Prime', aliases: ['amazon prime', 'prime video'], category: 'Subscriptions', subcategory: 'OTT' },
  { name: 'Disney+ Hotstar', aliases: ['hotstar', 'disney+', 'jiohotstar'], category: 'Subscriptions', subcategory: 'OTT' },
  { name: 'Spotify', aliases: ['spotify'], category: 'Subscriptions', subcategory: 'Music' },
  { name: 'YouTube Premium', aliases: ['youtube premium', 'google youtube'], category: 'Subscriptions', subcategory: 'OTT' },
  { name: 'SonyLIV', aliases: ['sonyliv'], category: 'Subscriptions', subcategory: 'OTT' },
  { name: 'ZEE5', aliases: ['zee5'], category: 'Subscriptions', subcategory: 'OTT' },
  { name: 'Apple', aliases: ['apple.com/bill', 'itunes', 'icloud'], category: 'Subscriptions', subcategory: 'Cloud & Software' },
  { name: 'Google One', aliases: ['google one', 'google storage'], category: 'Subscriptions', subcategory: 'Cloud & Software' },
  { name: 'Cult.fit', aliases: ['cult.fit', 'cultfit', 'curefit'], category: 'Subscriptions', subcategory: 'Fitness' },

  // Healthcare
  { name: 'Apollo Pharmacy', aliases: ['apollo pharmacy', 'apollo'], category: 'Healthcare', subcategory: 'Pharmacy' },
  { name: 'PharmEasy', aliases: ['pharmeasy'], category: 'Healthcare', subcategory: 'Pharmacy' },
  { name: 'Tata 1mg', aliases: ['1mg', 'tata 1mg'], category: 'Healthcare', subcategory: 'Pharmacy' },
  { name: 'Netmeds', aliases: ['netmeds'], category: 'Healthcare', subcategory: 'Pharmacy' },
  { name: 'Practo', aliases: ['practo'], category: 'Healthcare', subcategory: 'Doctor Consultation' },
  { name: 'Dr Lal PathLabs', aliases: ['lal pathlabs', 'pathlabs'], category: 'Healthcare', subcategory: 'Diagnostics' },

  // Utilities & telecom
  { name: 'Airtel', aliases: ['airtel'], category: 'Mobile & Internet', subcategory: 'Postpaid Bill' },
  { name: 'Jio', aliases: ['jio', 'reliance jio'], category: 'Mobile & Internet', subcategory: 'Mobile Recharge' },
  { name: 'Vi', aliases: ['vodafone', 'vi postpaid', 'idea cellular'], category: 'Mobile & Internet', subcategory: 'Postpaid Bill' },
  { name: 'BSNL', aliases: ['bsnl'], category: 'Mobile & Internet', subcategory: 'Broadband' },
  { name: 'ACT Fibernet', aliases: ['act fibernet', 'act broadband'], category: 'Mobile & Internet', subcategory: 'Broadband' },
  { name: 'Tata Power', aliases: ['tata power'], category: 'Utilities', subcategory: 'Electricity' },
  { name: 'Adani Electricity', aliases: ['adani electricity'], category: 'Utilities', subcategory: 'Electricity' },
  { name: 'KSEB', aliases: ['kseb'], category: 'Utilities', subcategory: 'Electricity' },
  { name: 'BESCOM', aliases: ['bescom'], category: 'Utilities', subcategory: 'Electricity' },
  { name: 'Indane Gas', aliases: ['indane', 'hp gas', 'bharat gas'], category: 'Utilities', subcategory: 'Gas' },

  // Investments
  { name: 'Zerodha', aliases: ['zerodha', 'kite'], category: 'Investments', subcategory: 'Stocks' },
  { name: 'Groww', aliases: ['groww'], category: 'Investments', subcategory: 'SIP / Mutual Fund' },
  { name: 'Upstox', aliases: ['upstox'], category: 'Investments', subcategory: 'Stocks' },
  { name: 'Coin by Zerodha', aliases: ['zerodha coin'], category: 'Investments', subcategory: 'SIP / Mutual Fund' },
  { name: 'ET Money', aliases: ['et money', 'etmoney'], category: 'Investments', subcategory: 'SIP / Mutual Fund' },

  // Insurance
  { name: 'LIC', aliases: ['lic of india', 'lic premium', 'lic'], category: 'Insurance', subcategory: 'Life' },
  { name: 'HDFC Ergo', aliases: ['hdfc ergo'], category: 'Insurance', subcategory: 'Health' },
  { name: 'Star Health', aliases: ['star health'], category: 'Insurance', subcategory: 'Health' },
  { name: 'ICICI Lombard', aliases: ['icici lombard'], category: 'Insurance', subcategory: 'Vehicle' },
  { name: 'Policybazaar', aliases: ['policybazaar'], category: 'Insurance', subcategory: 'Term' },

  // Education
  { name: 'Udemy', aliases: ['udemy'], category: 'Education', subcategory: 'Online Courses' },
  { name: 'Coursera', aliases: ['coursera'], category: 'Education', subcategory: 'Online Courses' },
  { name: 'BYJUS', aliases: ["byju", 'byjus'], category: 'Education', subcategory: 'Coaching' },
  { name: 'Unacademy', aliases: ['unacademy'], category: 'Education', subcategory: 'Coaching' },

  // Vehicle
  { name: 'Maruti Service', aliases: ['maruti service', 'maruti suzuki service'], category: 'Vehicle Maintenance', subcategory: 'Service' },
  { name: 'GoMechanic', aliases: ['gomechanic'], category: 'Vehicle Maintenance', subcategory: 'Service' },
  { name: 'Bosch Car Service', aliases: ['bosch car service'], category: 'Vehicle Maintenance', subcategory: 'Service' },

  // Home services
  { name: 'Urban Company', aliases: ['urban company', 'urbanclap'], category: 'Home Maintenance', subcategory: 'Repairs' },
];

/**
 * Keyword weights per category. Higher weight = stronger signal.
 * Scores are summed, so several weak hits can outrank one strong hit.
 */
export const CATEGORY_KEYWORDS: Record<string, Array<[string, number]>> = {
  'Food & Dining': [['lunch', 3], ['dinner', 3], ['breakfast', 3], ['brunch', 3], ['restaurant', 3], ['hotel food', 2], ['food', 2.5], ['meal', 2.5], ['snack', 2], ['tea', 1.5], ['coffee', 2], ['pizza', 2.5], ['burger', 2.5], ['biryani', 3], ['dosa', 2.5], ['thali', 2.5], ['cafe', 2], ['canteen', 2.5], ['tiffin', 2.5], ['sweets', 2], ['bakery', 2.5], ['juice', 1.5], ['ice cream', 2.5], ['dine', 2], ['takeaway', 2], ['eatery', 2.5], ['mess bill', 2.5]],
  Grocery: [['grocery', 4], ['groceries', 4], ['supermarket', 3], ['vegetables', 3], ['veggies', 3], ['fruits', 2.5], ['provisions', 3], ['kirana', 3.5], ['milk', 2], ['rice bag', 2.5], ['atta', 2.5], ['household items', 2.5], ['ration', 3]],
  Fuel: [['petrol', 4], ['diesel', 4], ['fuel', 4], ['refuel', 4], ['gas station', 3], ['filling station', 3], ['cng', 3.5], ['ev charging', 3.5], ['pump', 1.5], ['tank full', 3]],
  Family: [['mother', 2.5], ['father', 2.5], ['mom', 2.5], ['dad', 2.5], ['parents', 3], ['wife', 2.5], ['husband', 2.5], ['son', 2], ['daughter', 2], ['kids', 2], ['family', 3], ['maid', 2.5], ['househelp', 2.5], ['pocket money', 2.5]],
  'Friends & Social': [['friend', 3], ['friends', 3], ['party', 2.5], ['outing', 2.5], ['get together', 3], ['treat', 2], ['split', 2], ['settled with', 2.5], ['reunion', 2.5]],
  'Luxury Purchases': [['watch', 2], ['rolex', 4], ['jewellery', 3], ['jewelry', 3], ['gold chain', 3], ['diamond', 3], ['luxury', 3.5], ['designer', 2.5], ['premium brand', 3]],
  'Movies & Entertainment': [['movie', 4], ['movies', 4], ['cinema', 3.5], ['film', 2.5], ['ticket', 1.5], ['tickets', 1.5], ['concert', 3], ['show', 1.5], ['theatre', 3], ['multiplex', 3], ['gaming', 2.5], ['game pass', 2.5], ['amusement park', 3], ['bowling', 2.5]],
  Liquor: [['liquor', 4], ['alcohol', 4], ['beer', 3.5], ['whisky', 3.5], ['whiskey', 3.5], ['wine', 3], ['rum', 3], ['vodka', 3.5], ['brandy', 3.5], ['bar bill', 3], ['pub', 3], ['wine shop', 4], ['booze', 3.5]],
  Education: [['tuition', 4], ['school fee', 4], ['college fee', 4], ['course', 2.5], ['books', 2], ['exam fee', 3.5], ['coaching', 3], ['semester', 3], ['admission fee', 3.5], ['stationery', 2], ['certification', 2.5]],
  Healthcare: [['doctor', 3.5], ['hospital', 3.5], ['medicine', 3.5], ['medicines', 3.5], ['pharmacy', 3.5], ['medical', 3], ['clinic', 3], ['dental', 3.5], ['dentist', 3.5], ['lab test', 3.5], ['scan', 2], ['blood test', 3.5], ['consultation', 2.5], ['surgery', 3.5], ['physiotherapy', 3.5], ['vaccine', 3]],
  Travel: [['flight', 3.5], ['train', 3], ['bus ticket', 3.5], ['cab', 3.5], ['taxi', 3.5], ['auto', 2], ['travel', 3], ['trip', 2.5], ['hotel stay', 3.5], ['booking', 1.5], ['toll', 3], ['parking', 3], ['airport', 2.5], ['vacation', 3], ['holiday', 2], ['ride', 2], ['metro', 2.5], ['railway', 3]],
  Shopping: [['shopping', 3.5], ['bought', 1.5], ['purchase', 1.5], ['order', 1], ['headphone', 2.5], ['mobile phone', 2.5], ['laptop', 2.5], ['electronics', 3], ['gadget', 2.5], ['furniture', 3], ['kitchenware', 2.5], ['appliance', 2.5]],
  Utilities: [['electricity', 4], ['power bill', 4], ['water bill', 4], ['gas bill', 3.5], ['gas cylinder', 3.5], ['lpg', 3.5], ['maintenance charge', 3], ['society bill', 3], ['utility', 3], ['sewage', 2.5]],
  'Mobile & Internet': [['recharge', 3.5], ['mobile bill', 4], ['postpaid', 3.5], ['prepaid', 3], ['broadband', 4], ['wifi', 3], ['internet bill', 4], ['data pack', 3.5], ['dth', 3.5], ['landline', 3]],
  'Rent/Housing': [['rent', 4], ['house rent', 4.5], ['flat rent', 4.5], ['landlord', 4], ['brokerage', 3], ['security deposit', 3], ['society fees', 3], ['pg rent', 4]],
  Insurance: [['insurance', 4], ['premium', 2.5], ['policy', 2.5], ['mediclaim', 4], ['term plan', 3.5], ['lic premium', 4]],
  Investments: [['sip', 4], ['mutual fund', 4], ['invested', 3.5], ['investment', 3.5], ['stocks', 3.5], ['shares', 3], ['ppf', 4], ['nps', 4], ['fixed deposit', 4], [' fd ', 2.5], ['recurring deposit', 4], ['gold bond', 3.5], ['crypto', 3], ['demat', 3]],
  'EMI/Loans': [['emi', 4.5], ['loan', 4], ['instalment', 3.5], ['installment', 3.5], ['home loan', 4.5], ['car loan', 4.5], ['personal loan', 4.5], ['repayment', 3], ['principal', 2]],
  // Money moving between the user's own accounts — never counted as spending.
  Transfers: [['credit card bill', 4.5], ['card bill payment', 4.5], ['card payment', 3], ['statement payment', 4], ['self transfer', 4.5], ['own account', 3.5], ['wallet top-up', 4.5], ['wallet topup', 4.5], ['added money to wallet', 4.5], ['transferred to my', 4]],
  Subscriptions: [['subscription', 4], ['renewal', 3], ['monthly plan', 3], ['annual plan', 3], ['membership', 3], ['auto-renew', 3.5], ['autopay', 2]],
  Clothing: [['clothes', 3.5], ['shirt', 3], ['tshirt', 3], ['t-shirt', 3], ['jeans', 3], ['dress', 2.5], ['saree', 3.5], ['kurta', 3.5], ['footwear', 3], ['shoes', 3], ['apparel', 3.5], ['tailor', 3]],
  'Personal Care': [['salon', 4], ['haircut', 4], ['spa', 3.5], ['grooming', 3], ['cosmetics', 3.5], ['skincare', 3.5], ['parlour', 4], ['massage', 3]],
  Gifts: [['gift', 3.5], ['gifts', 3.5], ['birthday present', 4], ['wedding gift', 4], ['anniversary gift', 4], ['present for', 3]],
  Donations: [['donation', 4], ['donated', 4], ['charity', 4], ['temple', 3], ['church', 3], ['mosque', 3], ['ngo', 3.5], ['offering', 2], ['fundraiser', 3.5]],
  'Vehicle Maintenance': [['car service', 4], ['bike service', 4], ['vehicle service', 4], ['servicing', 3], ['puncture', 3.5], ['tyre', 3.5], ['spare parts', 3.5], ['car wash', 3.5], ['garage', 3], ['mechanic', 3.5], ['engine oil', 3.5]],
  'Home Maintenance': [['plumber', 4], ['electrician', 4], ['carpenter', 4], ['painting', 3], ['home repair', 4], ['appliance repair', 4], ['pest control', 4], ['deep cleaning', 3.5], ['ac service', 3.5]],
  Other: [['miscellaneous', 3], ['misc', 2], ['fees', 1.5], ['charges', 1.5], ['fine', 2.5], ['penalty', 2.5], ['atm withdrawal', 3], ['cash withdrawal', 3.5]],
};

/** Income keyword weights, used when the text looks like money coming in. */
export const INCOME_KEYWORDS: Record<string, Array<[string, number]>> = {
  Salary: [['salary', 4.5], ['payroll', 4], ['sal credited', 4.5], ['monthly pay', 3.5], ['stipend', 3], ['arrears', 3], ['reimbursement', 3]],
  Bonus: [['bonus', 4.5], ['diwali bonus', 4.5], ['joining bonus', 4.5]],
  Incentives: [['incentive', 4.5], ['commission', 4], ['referral bonus', 4], ['performance pay', 4]],
  Freelancing: [['freelance', 4.5], ['consulting fee', 4], ['project payment', 3.5], ['invoice paid', 3.5], ['client payment', 4]],
  'Interest Income': [['interest credited', 4.5], ['interest', 3], ['fd interest', 4.5], ['savings interest', 4.5]],
  'Rental Income': [['rent received', 4.5], ['rental income', 4.5], ['tenant', 3.5]],
  'Investment Gains': [['dividend', 4.5], ['capital gain', 4.5], ['redemption', 4], ['maturity', 3.5], ['profit booked', 4]],
  Refunds: [['refund', 4.5], ['refunded', 4.5], ['cashback', 4], ['reversed', 3], ['claim settled', 4], ['tax refund', 4.5]],
  'Other Income': [['gift received', 4], ['lottery', 4], ['prize money', 4]],
};

/** Phrases that indicate money moving out. */
export const DEBIT_MARKERS = [
  'debited', 'debit', 'spent', 'paid', 'payment of', 'purchase of', 'withdrawn', 'deducted',
  'charged', 'bought', 'sent', 'transferred to', 'paying', 'bill paid', 'txn of', 'used for',
];

/** Phrases that indicate money coming in. */
export const CREDIT_MARKERS = [
  'credited', 'credit of', 'received', 'deposited', 'refund', 'refunded', 'cashback',
  'salary credited', 'transferred from', 'reversal', 'added to your account',
];

export const PAYMENT_MODE_MARKERS: Array<[PaymentMode, string[]]> = [
  ['UPI', ['upi', 'vpa', '@okhdfcbank', '@okaxis', '@oksbi', '@ybl', '@paytm', '@ibl', '@axl', 'gpay', 'google pay', 'phonepe', 'phone pe', 'bhim', 'upi ref', 'upi/', 'scan and pay', 'qr code']],
  ['Credit Card', ['credit card', 'cc ending', 'creditcard', 'cred card', 'card xx', 'credit crd']],
  ['Debit Card', ['debit card', 'debitcard', 'atm card', 'debit crd']],
  ['Net Banking', ['net banking', 'netbanking', 'imps', 'neft', 'rtgs', 'internet banking', 'fund transfer']],
  ['Wallet', ['wallet', 'paytm wallet', 'amazon pay balance', 'mobikwik', 'freecharge']],
  ['Cash', ['cash', 'in cash', 'paid cash', 'by cash', 'currency']],
];
