# Personal Finance App — Project Requirements

> **Superseded — 2026-08-01.** This is the original day-one project spec (2026-04-01) and predates
> essentially everything built since: Phases 1–4, Auth, Alerts, recurring transactions, earmarked
> funds, the debt restructure (credit card/loan/BNPL types), Month-End Review, and the Type 1/2/3
> notification model are all missing from this doc. Several things listed as planned here shipped
> differently than described — e.g. `POST /debts/simulate` was never built as a backend endpoint,
> the payoff simulator runs client-side instead; the banking-API sync (`sync.py`,
> `categorization.py`) was abandoned in favor of an email-ingestion pipeline; WhatsApp/Twilio
> delivery became Telegram + PWA push. Kept here as the original scope record, not as an active
> spec. **`Tracker.md` (repo root) is the live source of truth** for what's built and what's next.
>
> **Status:** Superseded by `Tracker.md`
> **Last Updated:** 2026-04-01 (original)
> **Stack:** React · FastAPI · PostgreSQL (Supabase) · Chart.js
> **Hosting:** Vercel (frontend) · Render (backend)

---

## 1. Project Goals

Build a full-stack personal finance application that gives users a clear, automated view of their finances. The app should handle income, expenses, subscriptions, debt, and savings goals — with smart automation to reduce manual data entry and proactive alerts before problems occur.

**Learning goals alongside building:**

- Understand REST API design with FastAPI
- Learn how a React frontend communicates with a Python backend
- Work with a real relational database (PostgreSQL) via SQLAlchemy ORM
- Experience a decoupled architecture deployed to separate cloud services

---

## 2. Technology Stack

| Layer           | Technology                           | Why                                        |
| --------------- | ------------------------------------ | ------------------------------------------ |
| Frontend UI     | React (Vite)                         | Component-based UI, huge ecosystem         |
| Visualizations  | Chart.js                             | Lightweight, good docs, easy with React    |
| Frontend Host   | Vercel                               | Free tier, auto-deploys from GitHub        |
| Backend API     | FastAPI (Python)                     | Fast, auto-generates docs, Pythonic        |
| ORM             | SQLAlchemy                           | Maps Python classes to DB tables           |
| Database        | PostgreSQL via Supabase              | Free hosted Postgres, easy setup           |
| Scheduled Tasks | Cron on Render                       | Triggers syncs and reminders automatically |
| Backend Host    | Render                               | Hosts FastAPI, free tier available         |
| Banking Data    | Plaid / GoCardless / TrueLayer (TBD) | Fetches real bank transactions via API     |

---

## 3. Feature Requirements

### 3.1 Core Tracking

#### Transactions

- [ ] Manual transaction entry (amount, date, description, category, type)
- [ ] CSV / Excel bulk import from bank statement downloads
- [ ] Auto-categorization of transactions by merchant name + rules engine
- [ ] Income tracking (salary, side income, refunds, transfers)
- [ ] Expense tracking with categories (groceries, transport, dining, etc.)
- [ ] Edit / delete any transaction

#### Budget Planning

- [ ] Set a monthly planned budget per category
- [ ] Compare planned vs actual spending per category
- [ ] Visual progress indicator (bar or gauge) per category
- [ ] Monthly budget reset / carry-forward logic

#### Bills & Subscriptions

- [ ] Add recurring bills with: name, amount, due date, frequency (monthly/annual)
- [ ] Mark bills as paid / unpaid
- [ ] Rent tracking (treated as a recurring bill)
- [ ] 7-day advance reminder before due date
- [ ] Overdue detection

#### Savings Goals

- [ ] Create multiple independent savings goals
- [ ] Fields: goal name, target amount, current amount, deadline
- [ ] Progress bar per goal (current / target)
- [ ] Log manual contributions toward a goal

#### Debt Management

- [ ] Track debts: name, current balance, interest rate, minimum payment
- [ ] Priority ranking for payoff order
- [ ] Running balance decrease over time

---

### 3.2 Advanced Features

#### Debt Payoff Simulator

- [ ] **Waterfall strategy** — pay minimum on all, throw extra at highest interest first
- [ ] **Snowball strategy** — pay minimum on all, throw extra at lowest balance first
- [ ] Input: extra monthly payment available
- [ ] Output: debt-free date per strategy, total interest saved
- [ ] Chart: projected balance decrease over time for each debt

#### Smart Alert Engine (Rule-Based)

Alerts are evaluated after every sync and on a daily schedule.

| Rule           | Condition                                        | Delivery         |
| -------------- | ------------------------------------------------ | ---------------- |
| Over budget    | Spending in category > planned budget            | Dashboard + push |
| Spike detected | Spending X% higher than same category last month | Dashboard + push |
| Bill due soon  | Bill due within 7 days and status = unpaid       | Dashboard + push |
| Near limit     | Category reaches 90% of its budget               | Dashboard only   |

**Alert delivery channels:**

- In-app: Alert panel on dashboard
- External: WhatsApp (via Twilio / WhatsApp Business API) or SMS

---

### 3.3 Banking API Integration (Automated Sync)

> **Decision pending:** Plaid (US-focused) vs GoCardless/TrueLayer (EU/UK-focused)

- [ ] OAuth connection flow — user links bank account securely
- [ ] Scheduled sync: fetch new transactions every 24h (cron job on Render)
- [ ] Fetch: transactions, account balances, recurring payment detection
- [ ] Standardize merchant names (e.g. "AMZN MKTP US" → "Amazon")
- [ ] Apply auto-categorization rules before writing to DB
- [ ] Manual fallback for unsupported banks (CSV import)

---

### 3.4 Data Import / Export

| Operation             | Format             | Notes                     |
| --------------------- | ------------------ | ------------------------- |
| Import transactions   | CSV, Excel (.xlsx) | Map columns during import |
| Export transactions   | CSV, Excel, PDF    | Date-range filter         |
| Export monthly report | PDF                | Summary with charts       |

---

## 4. Data Model

### Transactions

```
id            UUID, primary key
date          DATE
description   VARCHAR(255)       raw merchant name
category      VARCHAR(100)       e.g. "groceries", "transport"
type          ENUM(income, expense)
amount        DECIMAL(10, 2)
planned_amt   DECIMAL(10, 2)     budget allocation for this category/month
payment_method VARCHAR(50)       e.g. "bank", "cash", "credit card"
source        ENUM(manual, import, api_sync)
created_at    TIMESTAMP
```

### Bills

```
id            UUID, primary key
name          VARCHAR(100)
amount        DECIMAL(10, 2)
due_date      DATE
frequency     ENUM(monthly, annual, weekly)
status        ENUM(paid, unpaid)
auto_detected BOOLEAN           detected from bank sync?
```

### Debts

```
id            UUID, primary key
name          VARCHAR(100)
balance       DECIMAL(10, 2)
interest_rate DECIMAL(5, 2)     annual % rate (APR)
min_payment   DECIMAL(10, 2)
priority_rank INTEGER
```

### Savings Goals

```
id            UUID, primary key
goal_name     VARCHAR(100)
target_amount DECIMAL(10, 2)
current_amount DECIMAL(10, 2)
deadline_date DATE
```

### Alerts

```
id            UUID, primary key
rule_type     VARCHAR(50)       e.g. "over_budget", "bill_due"
message       TEXT
is_read       BOOLEAN
triggered_at  TIMESTAMP
```

---

## 5. API Endpoints (FastAPI)

### Transactions

```
GET    /transactions              List with filters (date range, category, type)
POST   /transactions              Create manual transaction
PUT    /transactions/{id}         Update
DELETE /transactions/{id}         Delete
POST   /transactions/import       Bulk CSV/Excel upload
GET    /transactions/export       Download CSV/PDF
```

### Bills

```
GET    /bills                     List all bills
POST   /bills                     Create
PUT    /bills/{id}                Update / mark paid
DELETE /bills/{id}                Delete
```

### Debts

```
GET    /debts                     List all debts
POST   /debts                     Create
PUT    /debts/{id}                Update balance
DELETE /debts/{id}                Delete
POST   /debts/simulate            Run waterfall/snowball simulation
```

### Savings

```
GET    /savings                   List goals
POST   /savings                   Create goal
PUT    /savings/{id}              Update / log contribution
DELETE /savings/{id}              Delete
```

### Alerts

```
GET    /alerts                    List active alerts
PUT    /alerts/{id}/read          Mark as read
DELETE /alerts/{id}               Dismiss
```

### Sync (Banking API)

```
POST   /sync/connect              Initiate bank OAuth flow
POST   /sync/trigger              Manual sync trigger
GET    /sync/status               Last sync time, status
```

---

## 6. Dashboard UI — Views & Visualizations

| View              | Description                                      | Chart Type              |
| ----------------- | ------------------------------------------------ | ----------------------- |
| Overview Panel    | Income vs expenses, net balance, savings summary | Bar (planned vs actual) |
| Expense Breakdown | Spending by category this month                  | Pie chart               |
| Spending Trends   | Month-over-month spending per category           | Line chart              |
| Budget Progress   | Per-category bar showing % used                  | Horizontal bar / gauge  |
| Bills Panel       | Upcoming due dates, paid/unpaid status           | Table                   |
| Debt Tracker      | Balances, rates, payoff simulation result        | Area/line chart         |
| Savings Goals     | Progress per goal                                | Progress bars           |
| Alerts Center     | Active alerts, notification history              | Card list               |

---

## 7. Application Workflow

```
1. CRON TRIGGER (daily)
   └─► FastAPI calls Banking API (Plaid / GoCardless)
       └─► Raw transaction data returned

2. STANDARDIZATION
   └─► Merchant names cleaned
   └─► Categories assigned by rules engine (categorization.py)

3. DATABASE WRITE
   └─► SQLAlchemy commits new transactions to Supabase

4. ALERT EVALUATION
   └─► alert_engine.py checks all rules against new data
   └─► New alerts written to alerts table
   └─► If threshold crossed → dispatch WhatsApp/SMS notification

5. FRONTEND POLL / REFRESH
   └─► React fetches updated data from FastAPI
   └─► Chart.js re-renders visuals
   └─► Alert panel updates
```

---

## 8. Build Phases

### Phase 1 — Foundation (Weeks 1–3)

- [ ] Set up project folder structure (frontend + backend)
- [ ] Initialize React app with Vite
- [ ] Initialize FastAPI with basic "hello world" endpoint
- [ ] Connect FastAPI to Supabase PostgreSQL (test connection)
- [ ] Create SQLAlchemy models for all 4 tables
- [ ] Run first Alembic migration (create tables in DB)

### Phase 2 — Core CRUD (Weeks 4–6)

- [ ] Build all API endpoints (transactions, bills, debts, savings)
- [ ] Build React forms for manual entry
- [ ] Connect frontend to backend (axios/fetch calls)
- [ ] Display transaction list, bill list, debt list
- [ ] Basic Chart.js visuals: bar chart, pie chart

### Phase 3 — Intelligence Layer (Weeks 7–9)

- [ ] Auto-categorization rules engine
- [ ] Debt payoff simulator (waterfall + snowball)
- [ ] Smart alert engine (4 rules)
- [ ] In-app alerts panel

### Phase 4 — Automation (Weeks 10–12)

- [ ] Banking API integration (OAuth flow + sync)
- [ ] Scheduled cron jobs on Render
- [ ] CSV/Excel import + export
- [ ] WhatsApp / SMS notifications

### Phase 5 — Polish & Deploy (Weeks 13–14)

- [ ] Full deploy: frontend to Vercel, backend to Render
- [ ] Environment variables wired up correctly
- [ ] Error handling, loading states, empty states
- [ ] Basic mobile responsiveness

---

## 9. Environment Variables

### Frontend (.env in /frontend)

```
VITE_API_URL=http://localhost:8000         # → your Render URL in production
VITE_PLAID_ENV=sandbox                     # sandbox | development | production
```

### Backend (.env in /backend)

```
DATABASE_URL=postgresql://user:pass@host/db
SECRET_KEY=your-secret-key-here
PLAID_CLIENT_ID=...
PLAID_SECRET=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=...
```

> ⚠️ **Never commit .env files to Git.** Add them to `.gitignore` immediately.

---

## 10. Key Decisions Still Open

| Decision               | Options                           | Notes                            |
| ---------------------- | --------------------------------- | -------------------------------- |
| Banking API            | Plaid vs GoCardless vs TrueLayer  | Depends on your country/bank     |
| Auth                   | JWT (DIY) vs Supabase Auth        | Supabase Auth is easier to start |
| Push notifications     | Twilio WhatsApp vs SMS vs email   | WhatsApp cheapest in LATAM       |
| State management       | React Context vs Zustand vs Redux | Context is fine to start         |
| CSV parsing (frontend) | PapaParse                         | Most popular, easy               |

---

_This document is a living guide — update it as decisions are made and phases are completed._
