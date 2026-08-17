# FinanceOS

A full-stack personal finance and budgeting application. Track income, expenses, bills, debts, and savings goals — with a smart alert engine, CSV/XLSX import, and a debt payoff simulator.

**Live demo:** [View Demo](https://your-app.vercel.app) · **Backend API docs:** [Swagger UI](https://your-backend.onrender.com/docs)

---

## Features

- **Dashboard** — Balance (bank-anchored or computed), income vs. expenses, cashflow chart,
  budget progress, expense breakdown, upcoming/overdue bills, Free-to-Spend calculation
- **Transactions** — Manual entry, CSV/XLSX bulk import from bank statements, draft review
  workflow, text search by description, recurring transaction templates
- **Budget** — Plan monthly budgets per category (expense/income/savings), compare planned vs.
  actual, planned surplus/deficit summary
- **Bills & Subscriptions** — Track recurring payments, mark as paid, auto-reset to unpaid each
  cycle, sinking-fund provision for annual/quarterly bills
- **Debt Tracker** — Credit cards, loans, and BNPL as distinct types (amortization, billing
  cycles, installments), Avalanche and Snowball payoff simulator that accounts for real budget
  capacity
- **Savings Goals** — Multiple independent goals with progress tracking and contribution history
- **Smart Alerts** — Rule-based engine (14 rule types — over-budget, spending spikes, bills/debt
  due, low balance, goal pace, periodic review, and more), delivered via Telegram and PWA push,
  informative or interactive (deep-link) mode per alert
- **Month-End Review** — Score ring, budget scorecard, bills/debt snapshot, auto-generated
  insights (built, not yet linked in navigation — see `Tracker.md`)
- **Export** — Download transactions as CSV or XML (currently capped at a 3-month range)
- **Demo Mode** — Full walkthrough with mock data, no sign-up required

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Styling | Custom CSS (design tokens) + inline styles — no CSS framework |
| Charts | Chart.js |
| Auth | Supabase Auth (email/password) |
| API Client | Axios |
| Backend | FastAPI (Python) |
| ORM | SQLAlchemy 2 |
| Database | PostgreSQL via Supabase |
| Migrations | Alembic |
| Frontend Host | Vercel |
| Backend Host | Render |
| Scheduled Jobs | GitHub Actions (daily cron via `POST /scheduler/run`) — Render's Cron Jobs have no free tier |

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
│   ├── vite.config.js      # Vite config with dev proxy
│   └── .env                # Local env vars (never commit)
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
    │   └── notifications.py   # Telegram + PWA push (stub until keys added)
    ├── alembic/            # Database migrations
    ├── render.yaml         # Render deployment config
    ├── requirements.txt
    └── .env                # Local env vars (never commit)
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier is fine)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/financeos.git
cd financeos
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

Run migrations then start the server:

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
```

`frontend/.env` is already configured for local development — `VITE_API_URL=/api` is proxied to `localhost:8000` by Vite automatically.

```bash
npm run dev
# App running at http://localhost:5173
```

### 4. Seed system categories (first run only)

After running migrations, seed the default expense/income categories:

```bash
curl -X POST http://localhost:8000/categories/seed
```

---

## Environment Variables

### Backend (`Backend/.env` locally, Render dashboard in production)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Full PostgreSQL connection string from Supabase |
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase → Settings → API |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend URLs for CORS |
| `CRON_SECRET` | Random string to protect `POST /scheduler/run` |
| `TELEGRAM_BOT_TOKEN` | After creating bot via @BotFather (optional) |
| `VAPID_PUBLIC_KEY` | After running `npx web-push generate-vapid-keys` (optional) |
| `VAPID_PRIVATE_KEY` | Server-side only — never expose to frontend |
| `VAPID_CONTACT_EMAIL` | Contact email for VAPID auth |
| `GMAIL_ADDRESS` | Shared email-ingestion inbox address (e.g. `financeos.ingest@gmail.com`) |
| `GMAIL_APP_PASSWORD` | App Password for that inbox — generate at myaccount.google.com/apppasswords (requires 2-Step Verification). Powers IMAP-based email ingestion, no OAuth |

### Frontend (Vercel environment variables in production)

| Variable | Description |
|---|---|
| `VITE_API_URL` | **`/api`** locally · **full Render URL** on Vercel (e.g. `https://financeos.onrender.com`) |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key from Supabase → Settings → API |
| `VAPID_PUBLIC_KEY` | After VAPID key generation (optional) |

---

## Deployment

### Deploy to Render (Backend)

1. Create a new **Web Service** in [Render](https://render.com)
2. Connect your GitHub repo, set **Root Directory** to `Backend`
3. **Build command:** `pip install -r requirements.txt`
4. **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add all backend environment variables in the **Environment** tab
6. After the frontend is deployed, set `ALLOWED_ORIGINS` to your Vercel URL

### Deploy to Vercel (Frontend)

1. Create a new project in [Vercel](https://vercel.com), import from GitHub
2. Set **Root Directory** to `frontend`
3. Add all frontend environment variables, setting `VITE_API_URL` to your Render URL
4. Deploy — Vercel auto-detects Vite and uses `vercel.json` for the SPA rewrite

Full step-by-step instructions are in `Tracker.md`.

---

## Database Migrations

Migrations are managed with Alembic and run against the shared Supabase PostgreSQL instance.

```bash
# Apply all pending migrations
cd Backend && alembic upgrade head

# Create a new migration after model changes
alembic revision --autogenerate -m "description of change"
```

---

## Alert Engine

Alerts are evaluated in two ways:

- **Immediate (Tier 1):** Fires right away for time-sensitive events (bill due, debt overdue, etc.)
- **Daily digest (Tier 2):** Bundled and sent once a day, only if something's actually pending —
  evaluated by the scheduler (daily GitHub Actions workflow, `POST /scheduler/run`)

14 rule types are implemented in `alert_engine.py`: `bill_due`, `low_balance`, `debt_overdue`,
`goal_reached`, `budget_exceeded`, `spending_spike`, `import_reminder`, `balance_reminder`,
`goal_behind_pace`, `periodic_review`, `cc_payment_due`, `bnpl_installment_due`, `loan_paid_off`,
`min_payment_warning`.

External delivery is via Telegram (confirmed working end-to-end) and PWA push (implemented, but
untested — VAPID keys not yet generated).

---

## Roadmap

- [ ] Database normalization pass (see `Tracker.md` item #5) — includes writing a proper Alembic
      baseline migration, since the original `create_initial_tables` migration and 7 others were
      never committed to git
- [ ] Email ingestion pipeline (Gmail `+alias` forwarding → parser → transaction) — designed, not
      built; replaces live bank-API sync as the near-term automation path
- [ ] PWA push notifications (VAPID key generation + service worker)
- [ ] Monthly PDF report export / lifting the 3-month export cap
- [ ] Wire `MonthEndReview.jsx` into navigation (built, currently unreachable)
- [ ] Variable/irregular income support
- [ ] Live bank-account sync (Plaid / GoCardless / TrueLayer) — attempted, blocked by bank/aggregator
      access limits, not abandoned but not the near-term path (see `Tracker.md`)

---

## License

MIT
