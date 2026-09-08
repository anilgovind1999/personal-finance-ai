# FinSight — AI-Powered Personal Finance & Expense Intelligence

A personal finance manager that captures expenses, reads them out of messages and
receipts, routes every AI-detected transaction through a **mandatory approval
queue**, and turns the approved ledger into dashboards, budgets, forecasts and
plain-language financial insights.

Runs as a responsive web app — mobile-first, with a full desktop layout — in
light and dark mode. All data stays in the browser: no account, no server, no
upload.

---

## The three layers

| Layer | What it does |
| --- | --- |
| **1. Expense capture** | Manual entry, AI message parsing, and OCR receipt scanning. Income is tracked from day one alongside expenses. |
| **2. Approval & verification** | Everything the AI detects lands in *Pending Approval*. Approve, edit & approve, or reject. Nothing reaches the ledger unreviewed. |
| **3. Analytics & intelligence** | Executive dashboard, category/payment/bank analysis, budgets with alerts, forecasts, goals, insights, natural-language search and exportable reports. |

## Feature summary

**Income**
- Monthly and annual totals, a monthly average and the annualised run rate.
- Every income stream is classified **recurring or variable** from observed
  behaviour rather than its category label — a salary that started two months
  ago counts as dependable, a category called "Salary" with one payment in it
  does not — with the reason shown against each source, plus a month-to-month
  volatility figure.

**Recurring entries**
- Rules for rent, EMIs, SIPs, subscriptions and salary. When one falls due it
  proposes itself into the approval queue rather than posting, because a bill
  that arrives higher than expected is exactly what you want to catch. A rule
  fires once per month, and a day past a short month's end lands on its last day.

**Capture**
- Full entry form: date, amount (INR), merchant, category, subcategory, payment
  mode, bank account/card, remarks, tags, and bill/receipt attachments.
- 26 expense categories and 9 income categories with starter subcategories;
  custom categories and subcategories can be added inline from the form.
- Payment modes: UPI, Credit Card, Debit Card, Cash, Net Banking, Wallet.
- Account master for banks, cards and wallets — bank name, account name, type,
  card name, credit limit, statement day, due day. **Only the last 4 digits are
  ever stored or displayed.**

**AI message capture**
- Reads WhatsApp-style notes, SMS, bank alerts, UPI notifications and free text.
- Extracts amount, date, merchant, category, subcategory, payment mode, bank,
  card last-4 and location, each with its own confidence, plus an overall score.
- Knows Indian formats: `₹1,23,456.78`, `Rs.2,500`, `1.2 lakh`, `25k`,
  `two thousand five hundred`, day-first dates, UPI VPAs, `A/c XX4521`.
- Deliberately ignores available balance, reference numbers, OTPs and card
  digits when looking for the amount.
- Rejects non-transactions — OTP messages, promotions and bill reminders.
- Explains its reasoning field by field, so a wrong guess is obvious before you
  approve it.

**Receipt & invoice scanner**
- In-browser OCR (Tesseract), then structured extraction of merchant, date,
  grand total (never the sub-total), GST — including split CGST/SGST/IGST —
  GSTIN, invoice number and line items.
- The OCR engine, its WebAssembly core and the English language data are served
  from the app's own origin rather than a public CDN, so scanning works offline
  and no third party ever sees your receipt.

**Approval workflow (mandatory)**
- A separate *Pending Approval* section with per-item review, bulk approve, and
  an approved/rejected history.
- Items with no amount cannot be approved; approving twice cannot double-post;
  a rejected item can never later post.
- Only approved transactions update the ledger, dashboard, reports and analytics.

**Dashboard & analytics**
- KPIs: total income, total expenses, net savings, savings %, cash balance,
  credit card outstanding, monthly budget remaining, financial health score.
- Trends by day, week, month and year; category and subcategory breakdowns;
  payment-mode, bank-wise and card-wise analysis; top merchants; tag analysis;
  fixed-vs-variable split; weekday vs weekend.

**Budgets** — overall and per-category, monthly/quarterly/annual, with
utilisation, remaining, projected finish and alerts at 80% / 90% / 100%
(thresholds configurable).

**Financial intelligence** — highest spending category, avoidable spend,
lifestyle inflation, spending-pattern changes, average daily spend, weekend vs
weekday, seasonality, savings opportunities, subscription waste, duplicate
charges and unusual-spend alerts.

**Forecasting** — month-end and year-end expenses, projected cash balance,
saving potential and budget overrun risk, all derived from your own history.

**Goals** — emergency fund, vehicle, home, vacation, education, retirement and
custom goals, with target, current savings, progress % and projected completion.

**Safety net** — every destructive action asks first and says exactly what will
happen. Deletions are soft: transactions and captured messages go to a **recycle
bin** for a configurable retention window (30 days by default), can be restored
in one click, and are purged automatically once expired. An **append-only audit
trail** records every consequential change — created, edited, approved, rejected,
deleted, restored, budgets set, goals changed — with field-level before/after
values on edits, including what you overrode when the AI got something wrong.

**Reports** — monthly, annual, income, savings, cash flow, category, merchant,
credit card and budget reports, exportable to **Excel, PDF and CSV**, plus a
raw full-ledger CSV export.

**Smart search** — plain-English questions against the ledger, e.g.
*"How much did I spend on food last month?"*, *"Show fuel expenses in August"*,
*"Which credit card was used most?"*, *"What are my top 10 merchants?"*.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build
npm test         # 162 unit tests
```

`npm install` and `npm run build` also run `scripts/vendor-ocr.mjs`, which copies
the Tesseract worker, WASM core and English language data (~10 MB) out of
`node_modules` into `public/tesseract/`. They are deliberately not committed —
if the receipt scanner ever reports that the engine could not load, run
`npm run vendor:ocr` and rebuild.

`dist/` is a static bundle — host it anywhere, or install it to the home screen
from a mobile browser.

### A note on downloads

Report exports normally save through an anchor click. When the app is hosted
somewhere that does not let a page save files directly — the single-file preview
build is the case that matters — `downloadBlob` routes the save through the
host, which shows the viewer a confirmation naming the file. A viewer who
declines is not treated as an error.

### Deploying

Config for both platforms is committed, so there is nothing to fill in by hand:

- **Netlify** — *Add new site → Import an existing project*, pick this repo and
  branch. `netlify.toml` supplies the build command, publish directory, Node
  version, redirects and headers.
- **Vercel** — *Add New → Project*, import this repo. `vercel.json` supplies the
  same.

Both ship a strict `Content-Security-Policy`. The app makes no outbound requests
at all — no API, no CDN, no analytics — so the policy is locked to `'self'`,
with `'wasm-unsafe-eval'` and `blob:` only because the OCR engine runs as
WebAssembly inside a worker. It is verified in the browser against those exact
headers before each release, not just written down.

A public deployment exposes the *app*, not your data: every transaction stays in
your own browser's IndexedDB and is never sent anywhere. If you would still
rather it not be publicly reachable, both platforms offer password protection on
a deploy, or you can simply run it locally.

On first run the dashboard offers **Load sample data**: nine months of realistic
history plus five unreviewed messages, so every screen has something to show.
Settings → *Erase everything* clears it.

## How it is built

```
src/
  engine/
    parser/     AI message parsing — amount, date, entities, classification, lexicon
    ocr/        receipt field extraction from OCR text
    analytics   aggregation, breakdowns, balances, period summaries
    budget      utilisation, thresholds, projected overruns
    forecast    month-end, year-end, cash projection, goals, saving potential
    income      monthly/annual totals, recurring vs variable classification
    recurring   due-date rules that propose entries into the approval queue
    insights    the financial-intelligence generators
    health      the weighted 0-100 financial health score
    search      natural-language question answering
  store/        reducer (approval rules live here), audit log, persistence, demo data
  db/           IndexedDB wrapper — app state plus receipt blobs
  components/   design system, charts, shell, shared transaction form
  pages/        dashboard, capture, approvals, transactions, analytics,
                budgets, goals, accounts, reports, activity, settings
  export/       CSV / Excel / PDF report builders
```

React 18 + TypeScript (strict) + Vite + Tailwind + Recharts. Heavy dependencies
— OCR, Excel and PDF writers — are loaded on demand, so the initial bundle stays
small.

### A note on the intelligence layer

The extraction engine is a deterministic, on-device NLP pipeline: currency and
number-word parsing, date resolution, a merchant/bank/keyword lexicon, weighted
category scoring, and a confidence model that weights the amount and category
most heavily. It runs offline, costs nothing per transaction, and never sends
your financial data anywhere. `parseMessage()` is a pure function, so its
behaviour is pinned by tests rather than left to chance.

### Design and accessibility

Chart colours come from a categorical palette validated for colour-vision
deficiency separation in both light and dark mode; hues are assigned in fixed
order and never cycled — beyond eight series everything folds into a neutral
"Other". Charts always carry a legend and direct labels, so identity is never
carried by colour alone. Status colours are paired with an icon and a label.

### Transfers

Money you move between your own accounts — paying a credit card bill, topping up
a wallet — is recorded under the **Transfers** category. It moves account
balances but is excluded from income and expense totals, so settling a card bill
does not double-count the purchases you already recorded.

## Privacy

Everything is stored locally in IndexedDB in your browser. Nothing is uploaded,
there is no account, and no analytics or telemetry. Full account and card numbers
are never requested or stored — only the last four digits. Settings → *Export
backup* writes a JSON file you can restore later; clearing browser site data
erases everything.

## Testing

```
 src/engine/parser/parser.test.ts   35  message parsing, amounts, dates, categories
 src/engine/engine.test.ts          36  analytics, budgets, forecasts, insights, health, search
 src/store/reducer.test.ts          15  the mandatory approval workflow
 src/engine/ocr/receipt.test.ts     10  receipt field extraction
 src/export/exporters.test.ts        8  report building and CSV escaping
```

Plus two end-to-end browser passes, both run against the production build served
with the deployed security headers: one covering the empty state, AI capture,
the approve/reject rules, natural-language search, every screen, all three
export formats, theme switching, reload persistence and mobile layout; and one
that renders a receipt image, runs it through real OCR, and checks the scanner
reads the grand total, date, GST and merchant with no network access.
