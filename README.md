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

**Getting your data in**
- **Import** reads a CSV, Excel or PDF export from another tracker, or a
  statement from your bank — password-protected PDFs included — works out what
  its columns mean, and shows you every row before anything is written.
- Re-importing an overlapping period is safe: rows already in the ledger are
  marked and unticked.
- Or paste a bank SMS, an email, or a UPI message and let the on-device engine
  read it. Or photograph a receipt.

**Currency**
- Every total, budget and report is counted in one home currency, INR by
  default and changeable in Settings.
- A transaction can be entered in whatever currency it was actually paid in.
  It is converted once, at entry, and the ledger stores the converted figure
  *plus* the original amount and the rate used — so a rate that moves next week
  never rewrites what last month cost.
- A rate you type wins over a fetched one, because a bank's own rate includes
  its fees. Without any rate the app refuses the entry rather than quietly
  treating it as 1:1.
- Fetching rates automatically is **off by default**; with it off the app makes
  no internet requests at all. Turning it on sends currency codes to
  open.er-api.com and nothing else.

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
npm test         # 288 unit tests
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

### Installing it like an app

The deployed app is a progressive web app: on Android or desktop Chrome an
install prompt appears, and on iOS Safari it is *Share → Add to Home Screen*.
It then opens full screen with its own icon, and a service worker lets it open
offline. This needs the app served over https — a `file://` copy skips it.

### Accounts and cross-device sync

Out of the box the app stores everything in your browser's IndexedDB: no
account, no server, and **no sync** — your phone and your laptop hold separate
copies. Supplying a Firebase project turns on real accounts and live sync.

**What you get.** Email/password and Google sign-in; each person who signs in
sees only their own ledger; changes made on one device appear on the others
within a few seconds; the app keeps working offline and reconciles when it
reconnects.

**Setup, once:**

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: enable *Email/Password*, and *Google* if
   you want it.
3. **Firestore Database → Create database** (production mode).
4. **Project settings → General → Your apps → Web**: register an app and copy
   the config values.
5. `cp .env.example .env.local` and paste those values in. Rebuild.
6. Deploy the security rules — this step is not optional, it is what actually
   separates one user's data from another's:
   ```bash
   npx firebase-tools deploy --only firestore:rules
   ```
7. On Netlify or Vercel, add the same `VITE_FIREBASE_*` values as environment
   variables, and add your deployed domain under **Authentication → Settings →
   Authorised domains**.

**Who can sign up.** Anyone with the URL can create an account with their own
email and password. There is no invite list and nothing for you to approve.

**Email verification is required.** Registration sends a verification link, and
the security rules reject an unverified account, so no financial data can be read
or written until the address is confirmed. The gate screen polls, so confirming
on a phone continues the session already open on a laptop.

The screen reports what actually happened rather than assuming. If the send
failed — Firebase rate-limits these, and a project can exhaust its daily quota —
it says so, and says why, instead of telling someone to watch an inbox for a
message that was never sent. Sending is never allowed to throw: the account
exists either way, and an error there reads as "registration failed", which sends
people round to create it a second time and trips the rate limiter that caused
the problem.

A 60-second cooldown sits in front of every send, ours rather than Firebase's, so
the button reports a wait instead of spending an attempt that would be refused.
The app retries a failure on its own at most three times and then stops and waits
to be asked: a project that has exhausted its daily email quota would otherwise be
hit once a minute for as long as the tab stays open, which helps nobody and is
exactly what earns a rate limit. Pressing Resend always works, and does not count
against that budget. Failures that no amount of retrying will fix — an
unauthorised continue URL, a sign-in method that is off — are named as such and
the button is disabled.

*I've verified my email* reloads the account from Firebase and refreshes the token
so the new `email_verified` claim is in it, then unlocks. When the address still
is not confirmed it says so, rather than appearing to do nothing.

**Confirming with Google, when the email will not come.** The gate also offers
*Confirm with Google instead*, which links the Google account owning that same
address to the login. Google has already checked the person can read that
mailbox, which is the same thing the confirmation email is for — so this gives up
nothing: the rules still demand a verified address, and it genuinely is one. Only
the same address will do; a different one would attach a second identity without
proving the first. It is done once, and email and password sign in directly ever
after.

**Staying signed in.** The session persists across reloads and restarts by
default. *Keep me signed in on this device* on the sign-in screen turns that down
to the tab, for a shared machine. Persistence is set before the sign-in it
applies to, since Firebase does not apply it retroactively.

The link carries a continue URL back to the app. That URL has to be an authorised
domain, so if the project has not had this one added the send would fail outright;
it retries once without the continue URL rather than sending nothing.

**How users are kept apart.** Every document lives under
`users/{firebase-auth-uid}`, and the rules compare that path segment against the
caller's own UID. Ownership is keyed to the UID and never to an email address —
an email can be changed or re-registered, a UID cannot. There is no rule
anywhere granting a signed-in user access to anyone else's subtree, and a
default-deny rule covers everything outside it.

### No analytics

FinSight sends nothing to Google Analytics, or to any other analytics service.
There is no measurement ID, no tag, no usage events, and no setting to turn any
of that on, because none of it exists.

This was a deliberate reversal. An earlier version reported privacy-safe usage
counts — screen names and feature names, never figures. Supporting it meant
allowing a third-party script origin (`googletagmanager.com`) in `script-src`,
which is a real weakening of the policy: it is permission for someone else's
code to run on a page holding a person's entire financial history. Knowing how
many people opened the Budgets screen is not worth that.

The only servers the app talks to are your own Firebase project, and
`open.er-api.com` if you switch on live currency rates.

### Content Security Policy

`netlify.toml` and `vercel.json` both send the same policy. `connect-src` names
exactly the hosts the app needs and nothing else:

| Host | Why |
|---|---|
| `identitytoolkit.googleapis.com` | Registration, sign-in, password reset, email verification |
| `securetoken.googleapis.com` | Refreshing the session token |
| `firestore.googleapis.com` | Reading and writing your ledger |
| `firebaseinstallations.googleapis.com` | The Firebase SDK's own client registration |
| `firebase.googleapis.com` | Config lookups some SDK paths make |
| `open.er-api.com` | Currency rates, only if you turn live rates on |

Google sign-in additionally needs `https://apis.google.com` in `script-src` and
the auth iframe in `frame-src`. If you only use email and password, both can be
removed and the policy gets tighter still.

`frame-src` carries `https://*.firebaseapp.com` because the auth domain is
particular to your project and these files are static. Pin it to your own —
`https://your-project.firebaseapp.com` — and the last wildcard is gone.

There are no `https:` or `*` sources anywhere in the policy, and `default-src`
stays `'self'`. `netlify.toml`, `vercel.json` and `firebase.json` all send the
same string; a check that they still match is worth running after any edit.

`Cross-Origin-Opener-Policy` is `same-origin-allow-popups`, not `same-origin`.
Plain `same-origin` severs `window.opener`, which is exactly the channel the
Firebase sign-in popup uses to hand its result back to the page.

### Which build is deployed

Every build stamps itself with the commit it came from. A stale deployment and
a broken fix look identical from the outside, so this is worth checking before
debugging anything:

```bash
curl -s https://your-app.vercel.app/ | grep build-id
# <meta name="build-id" content="ce080b4" />
```

The same id is at the bottom of **Settings**, under the version line. If it does
not match `git rev-parse --short HEAD`, the site is running older code and no
amount of fixing the source will change what the browser does.

The service worker's cache is named after the build id too, so a new deploy can
never serve the previous build's files.

### Why the build is root-absolute

`vite.config.ts` sets `base: '/'`, not `'./'`, and the manifest uses absolute
paths. This matters more than it looks. All three hosts rewrite unknown paths to
`index.html`, so from any URL other than `/` a *relative* `<link rel="manifest">`
resolves to a path that does not exist, gets the app's own HTML back, and fails
to parse — and an installed app with an unparsed manifest falls back to a generic
icon. The service worker registration had the same flaw: registered from a deep
path it would take that path as its scope.

The manifest is also served with an explicit `application/manifest+json`
content type, since a manifest served as anything else is ignored.

### Shipping updates to people

Once deployed, you never send anyone a file again. Push to the branch, your host
rebuilds, and the running app notices: the service worker fetches the new build
in the background and the app offers *"A new version is ready — Reload now"*.
Nothing reloads by itself, so a half-typed entry is never lost. A tab left open
for days re-checks hourly.

Old caches are deleted when the new version takes over, and stored data is
untouched by an update.

**On the config values being public.** A Firebase web config is designed to ship
in the client; it identifies the project, it does not authorise anything. What
protects the data is `firestore.rules` plus Firebase Auth. `.env.local` is
gitignored anyway.

**How conflicts are handled.** State is split across four documents so unrelated
edits do not collide, and records are merged by id rather than one device
overwriting the other — two devices that were both offline keep both sets of
entries. Deletions survive a merge because a deleted record sits in the recycle
bin, which acts as a tombstone. Rarely-changed things (accounts, budgets,
settings) take whichever device changed them most recently.

**Two limits worth knowing.** Receipt images stay on the device that captured
them — they are not uploaded. And each Firestore document has a 1 MiB ceiling;
the app warns you well before your transaction history gets near it, at which
point the store needs splitting into per-record documents.

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
  sync/         cloud account, per-user documents, two-device merge rules
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

### First run

A new user is shown a seven-card tutorial before anything else: what the app is,
how to paste a bank message, the receipt scanner, why nothing counts until they
approve it, what the analytics give them, how mistakes are recovered, and how to put
the app on the home screen — with the instructions for the device actually in
their hand, since iPhone, Android and desktop each hide it somewhere different
and generic "install the app" advice is what makes people give up. It is
skippable at any point, never appears again on its own, and can be replayed from
**Settings → Show the tutorial again**.

The empty dashboard then offers *Paste a bank message* and *Take the tour*.

**Sample data is not offered to ordinary users.** Nine months of invented history
is useful for showing the app to someone and confusing for anyone tracking real
money, so it appears only in a build with no Firebase project behind it — a local
or demo copy. The deployment people actually sign in to never offers it. No
account, email address or role is consulted to decide this; it is simply absent
where it does not belong.

Whenever sample data is loaded, the dashboard says so in a banner with a
**Clear it** button. Clearing empties the ledger but keeps the choices the person
made for themselves — theme, currency, alert thresholds — and does not make them
sit through the tutorial again.

### Importing from another app or your bank

Someone arriving with months of history in another tracker should not have to
retype it, so **Import** reads a CSV or Excel export and turns it into
transactions. It also reads bank statement downloads, which are the same problem
wearing a different hat.

No two exports agree on anything, so the reader is built to be forgiving:

- **The delimiter is detected**, not assumed — comma, semicolon or tab.
- **The header row is found**, so a statement's account summary and blank lines
  above the table are skipped. A header is recognised by its cells being words
  where the rows below are dates and figures.
- **Columns are mapped by name where the header says something** (`Withdrawal
  Amt`, `Narration`, `Payment Method`) and by the shape of their values where it
  does not — a column of parseable dates is a date column whatever it is called.
- **Dates**: ISO, day-first, month names, and unformatted Excel serial numbers.
  `03/04/2026` is genuinely ambiguous, so the convention is worked out for the
  column as a whole by finding a value that can only be read one way, stated on
  screen, and switchable.
- **Amounts**: `₹1,23,456.78`, `(486.00)`, `486.00 Dr`, `-486`, and separate
  money-in/money-out columns. A file offering both a signed amount and a
  debit/credit pair uses the pair, since counting both would double the ledger.
- **Categories** come from the file when it has them. A bank statement never
  does, so the app's own merchant lexicon and keyword scoring fill them in — and
  every inferred category is marked on the preview, because that is the field it
  is most likely to get wrong.

**Nothing is imported unseen.** The preview lists every row that will be created,
with its date, merchant, category and amount; rows can be unticked and categories
corrected before anything is written. Rows that cannot be read are shown with the
reason rather than silently dropped. This screen is why imported entries go
straight to the ledger instead of the approval queue: the review has happened, in
bulk, where reviewing 300 statement rows one at a time would not be a review at
all.

**Re-importing is safe.** Any row matching a ledger entry on the same date, the
same direction and the same amount — with descriptions that do not actively
disagree — is marked *already have this* and unticked. Overlapping statements and
a month downloaded twice are the normal case, not the exception. The rows are
still there to tick back on.

**PDF statements are read too, including locked ones.** Banks here email
statements as password-protected PDFs, so both the reading and the unlocking have
to work or the feature is decorative. A wrong password says so and lets you try
again; the password is used on the device and never stored or sent.

A PDF has no rows and no columns — it has glyphs at coordinates, and a statement
only *looks* like a table because a person reads alignment as structure. The
reader does the same thing geometrically: text sharing a baseline is one line,
and text that lines up down the page is one column. Two details matter more than
they sound:

- **Columns are found from the whole page, not line by line.** A row with an
  empty deposit column is indistinguishable, on its own, from a row with one
  fewer column. Seen against the page, it becomes a row with an empty cell —
  which is the difference between money out and money in.
- **A sparse column is still a column.** Deposits are rarer than withdrawals, so
  a rule that discarded rarely-used columns as noise would drop the deposit
  column on a page with one salary credit, and that figure would land in the
  withdrawal column beside it — turning income into an expense. Every column is
  kept; a spurious one stays empty and is marked "don't import".

pdf.js is loaded only when a PDF is actually opened, and its worker is inlined
into the bundle rather than fetched, so nothing touches the network at the moment
a statement is read.

**A scanned statement has no text to read** — it is an image of a page. The app
says so rather than returning nothing, and points at the CSV download every net
banking site offers.

### Cross-referencing SMS against email

One purchase often announces itself twice: the bank texts the moment the card is
used, and the merchant emails a receipt minutes later. Both are worth capturing —
between them they carry more than either alone, since the text knows the card and
the email knows what was actually bought — but they must not become two expenses.

So every capture is checked against the review queue and the recent ledger before
it is added. **Amount, direction and date are gates**: the sums must agree to
within half a rupee, the direction must match, and the two must fall within three
days. Only then is the corroborating evidence weighed — the card's last four
digits, the merchant names, the bank, the payment mode, and whether the two
arrived through different channels.

The rules are deliberately asymmetric, because the two mistakes are not equally
bad. Merging two genuinely separate purchases destroys a record silently; failing
to merge only leaves a duplicate the reviewer can see. So:

- **Strong evidence** — the captures are merged. The queued item keeps its id, its
  place in the queue and anything already typed into it; the second message is
  attached to it, visible under *Show AI reading*, and confidence rises, because
  two independent sources agreeing is itself the best signal the engine has.
- **Suggestive evidence** — both are kept and the newer one is flagged *"This looks
  like another entry waiting for review."* The reviewer decides.
- **Two different cards, two different merchants, or an amount a rupee apart** —
  treated as separate events, whatever else lines up.

A capture that matches money **already posted to the ledger** is never merged, only
flagged: that money is recorded, and approving the capture would count it twice.

Every merge is written to the audit trail as its own *Cross-referenced* event, so
a decision the app made on your behalf is never invisible.

### Transfers

Money you move between your own accounts — paying a credit card bill, topping up
a wallet — is recorded under the **Transfers** category. It moves account
balances but is excluded from income and expense totals, so settling a card bill
does not double-count the purchases you already recorded.

## Privacy

Everything is stored locally in IndexedDB in your browser first, and the app
works fully with no account at all. Supply a Firebase project and a copy also
syncs to **your own** project, under your own user id, readable by nobody else —
see the security rules above.

There is no analytics and no telemetry of any kind. Messages, receipts and
statements are read on the device; no image, PDF or message body is ever
uploaded anywhere. Full account and card numbers are never requested or stored —
only the last four digits. Settings → *Export backup* writes a JSON file you can
restore later; clearing browser site data erases the local copy.

## Testing

```
 src/engine/engine.test.ts          36  analytics, budgets, forecasts, insights, health, search
 src/engine/parser/parser.test.ts   35  message parsing, amounts, dates, categories
 src/engine/income-recurring.test.ts 22 income tracking and recurring rules
 src/engine/reconcile.test.ts       20  SMS/email cross-referencing and its limits
 src/engine/parser/bank-sms.test.ts 19  real-world bank SMS shapes
 src/import/import.test.ts          35  reading other apps' exports and bank statements
 src/store/audit.test.ts            17  the audit trail and recycle bin
 src/engine/currency.test.ts        16  multi-currency conversion
 src/sync/model.test.ts             16  two-device merge semantics
 src/store/reducer.test.ts          19  the approval workflow, first run, sample data
 src/engine/ocr/receipt.test.ts     10  receipt field extraction
 src/export/exporters.test.ts        8  report building and CSV escaping
 src/import/pdf.test.ts             10  rebuilding a table from positioned PDF text
 src/import/pdf-roundtrip.test.ts    6  producing a real PDF and reading it back
 src/import/sheet.test.ts            4  reading a real .xlsx workbook
 src/sync/verification.test.ts      14  confirmation-email cooldown, retry budget, failures
```

Plus two end-to-end browser passes, both run against the production build served
with the deployed security headers: one covering the empty state, AI capture,
the approve/reject rules, natural-language search, every screen, all three
export formats, theme switching, reload persistence and mobile layout; and one
that renders a receipt image, runs it through real OCR, and checks the scanner
reads the grand total, date, GST and merchant with no network access.
