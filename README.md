# FinanceOS

A full-stack personal finance and budgeting application. Track income, expenses, bills, debts, and savings goals — with a rule-based alert engine, CSV/XLSX bank-statement import, and a debt payoff simulator.

I built it to replace the Excel sheet I was using to track my own money by hand. The app is live and works end to end (89 commits, April–October 2026). Active development is paused: without automatic bank capture, logging every transaction cost more effort than it saved. That lesson — a tool has to remove work, not add it — now shapes my next project.

**Live demo:** [project-financeos.vercel.app](https://project-financeos.vercel.app) (demo mode, no sign-up needed)

---

## Features

- **Dashboard** — Balance (bank-anchored or computed), income vs. expenses, cashflow chart,
  budget progress, expense breakdown, upcoming/overdue bills
- **Transactions** — Manual entry, CSV/XLSX bulk import from bank statements, draft review
  workflow, text search by description, recurring transaction templates
- **Budget** — Plan monthly budgets per category (expense/income/savings), compare planned vs.
  actual, planned surplus/deficit summary, per-category active/inactive toggle
- **Bills & Subscriptions** — Track recurring payments, mark as paid, automatic roll-forward to
  the next cycle, sinking-fund provision for annual/quarterly bills
- **Debt Tracker** — Credit cards, loans, and BNPL as distinct types (amortization, billing
  cycles, installments), with an Avalanche vs. Snowball payoff simulator that accounts for real
  budget capacity
- **Savings Goals** — Multiple independent goals with progress tracking and contribution history
- **Smart Alerts** — Rule-based engine with 14 rule types (over-budget, spending spikes,
  bills/debt due, low balance, goal pace, periodic review, and more), delivered through a
  Telegram bot; informative or interactive (deep-link) mode per alert
- **Month-End Review** — Score ring, budget scorecard, bills/debt snapshot, auto-generated
  insights (built; navigation entry pending)
- **Export** — Download transactions as CSV or XML (currently capped at a 3-month range)
- **Demo Mode** — Full walkthrough with mock data, no sign-up required

---

## Design decisions worth noting

### Transactions are the single source of truth

Every money movement — income, expense, bill payment, debt payment, savings contribution — is
written as a transaction. Budget actuals, dashboard numbers and the savings rate are all read
from that one ledger. Bills, debts and savings goals are linked to their transactions through a
hub table, so editing a transaction from the Transactions page updates the related bill, debt
or goal, and vice versa.

### Debt payments are their own transaction type

Debt payments were originally stored as expenses. That inflated expense reports and broke the
two-way link between a debt and its payments. Making `debt_payment` a distinct type keeps them
out of expense totals while still reducing both the cash balance and the debt balance. Credit
card purchases are tagged separately (`cc_charge`) so they count toward category spending
without being deducted from cash twice.

### Why there is no live bank sync

The original plan was direct bank connection. In Colombia, legitimate open-banking access is
closed to individuals, and the aggregators that are available work by scraping notifications,
which didn't meet the security bar I wanted for financial data. I also tried Plaid, GoCardless
and TrueLayer and was blocked by their access limits. The app uses statement import (CSV/XLSX)
instead, and I designed an email-ingestion pipeline as a fallback.

### Non-destructive schema changes

The app has real data in it, so every migration is additive: new columns are nullable or carry a
safe default, enum values are only ever added, and historical transactions are never rewritten.

---

## Tech Stack

| Layer          | Technology                                                |
| -------------- | --------------------------------------------------------- |
| Frontend       | React 19 + Vite                                           |
| Styling        | Custom CSS (design tokens) + inline styles                |
| Charts         | Chart.js                                                  |
| Auth           | Supabase Auth (email/password, JWT verified server-side)  |
| API Client     | Axios                                                     |
| Backend        | FastAPI (Python)                                          |
| ORM            | SQLAlchemy 2                                              |
| Database       | PostgreSQL via Supabase                                   |
| Migrations     | Alembic                                                   |
| Notifications  | Telegram Bot API                                          |
| Frontend Host  | Vercel                                                    |
| Backend Host   | Render                                                    |
| Scheduled Jobs | GitHub Actions (daily cron calling `POST /scheduler/run`) |

---

## Project Structure

```
FinanceOS/
├── frontend/               # React + Vite app
│   ├── src/
│   │   ├── api/            # Axios wrappers + business logic hooks
│   │   ├── pages/          # One .jsx per page (pure UI, no business logic)
│   │   ├── context/        # AuthContext, SettingsContext, NavContext
│   │   ├── data/           # MockData.js — demo mode seed data
│   │   └── App.jsx         # App shell, sidebar, route switching
│   ├── vercel.json         # Vercel deployment config
│   └── vite.config.js      # Vite config with dev proxy
│
└── Backend/                # FastAPI app
    ├── app/
    │   ├── routers/        # One router per feature (transactions, bills, …)
    │   ├── services/       # entity_sync, file_parser, payment_utils
    │   ├── main.py         # App factory + CORS + router registration
    │   ├── models.py       # SQLAlchemy models
    │   ├── dependencies.py # JWT auth dependency (Supabase ES256)
    │   ├── alert_engine.py # Rule-based alert evaluation
    │   ├── alert_scheduler.py # Daily cron runner + HTTP trigger
    │   └── notifications.py   # Telegram + PWA push delivery
    ├── alembic/            # Database migrations
    ├── render.yaml         # Render deployment config
    └── requirements.txt
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier is fine)

### 1. Clone the repo

```bash
git clone https://github.com/SirealX/FinanceOS.git
cd FinanceOS
```

### 2. Backend setup

```bash
cd Backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `Backend/.env`:

```env
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=<your-jwt-secret>
ALLOWED_ORIGINS=
CRON_SECRET=
```

Run migrations, then start the server:

```bash
alembic upgrade head
uvicorn app.main:app --reload
# API running at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
# App running at http://localhost:5173
```

`VITE_API_URL=/api` is proxied to `localhost:8000` by Vite during local development.

### 4. Seed system categories (first run only)

```bash
curl -X POST http://localhost:8000/categories/seed
```

---

## Environment Variables

### Backend (`Backend/.env` locally, Render dashboard in production)

| Variable                                                         | Description                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`                                                   | Full PostgreSQL connection string from Supabase        |
| `SUPABASE_URL`                                                   | Your Supabase project URL                              |
| `SUPABASE_JWT_SECRET`                                            | JWT secret from Supabase → Settings → API              |
| `ALLOWED_ORIGINS`                                                | Comma-separated list of allowed frontend URLs for CORS |
| `CRON_SECRET`                                                    | Random string that protects `POST /scheduler/run`      |
| `TELEGRAM_BOT_TOKEN`                                             | Bot token from @BotFather (optional)                   |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT_EMAIL` | PWA push keys (optional, planned)                      |
| `GMAIL_ADDRESS` / `GMAIL_APP_PASSWORD`                           | Email-ingestion inbox (planned feature)                |

### Frontend (Vercel environment variables in production)

| Variable                 | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `VITE_API_URL`           | `/api` locally · full Render URL in production |
| `VITE_SUPABASE_URL`      | Your Supabase project URL                      |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key from Supabase → Settings → API |

---

## Deployment

**Backend (Render):** create a Web Service, set the root directory to `Backend`, build with
`pip install -r requirements.txt`, start with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`,
and add the backend environment variables. Set `ALLOWED_ORIGINS` to the Vercel URL once the
frontend is live.

**Frontend (Vercel):** import the repo, set the root directory to `frontend`, add the frontend
environment variables with `VITE_API_URL` pointing at the Render URL, and deploy.

**Scheduler:** a GitHub Actions workflow calls `POST /scheduler/run` once a day with
`CRON_SECRET`, because Render's cron jobs have no free tier.

---

## Alert Engine

- **Immediate (Tier 1):** fires right away for time-sensitive events (bill due, debt overdue, etc.)
- **Daily digest (Tier 2):** bundled and sent once a day, only when something is pending

The 14 rule types in `alert_engine.py`: `bill_due`, `low_balance`, `debt_overdue`,
`goal_reached`, `budget_exceeded`, `spending_spike`, `import_reminder`, `balance_reminder`,
`goal_behind_pace`, `periodic_review`, `cc_payment_due`, `bnpl_installment_due`,
`loan_paid_off`, `min_payment_warning`.

Delivery through Telegram is working end to end. PWA push is implemented and pending VAPID key
setup.

---

## Roadmap

- [ ] Database normalization pass, including a complete Alembic baseline migration
- [ ] Email ingestion pipeline (forwarded bank emails → parser → transaction)
- [ ] PWA push notifications (VAPID keys + service worker)
- [ ] Monthly PDF report and a longer export range
- [ ] Month-End Review navigation entry
- [ ] Variable/irregular income support
- [ ] Live bank-account sync, if a secure provider becomes available in my region

---

## License

MIT
