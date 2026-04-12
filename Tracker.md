# FinanceOS — Build Tracker

> Paste this file at the start of any new conversation to resume context.  
> Update the status column as each item is completed.  
> Stack: React + FastAPI + PostgreSQL (Supabase) + Chart.js

---

## Environment Variables

| Variable                 | Location         | Status                                             |
| ------------------------ | ---------------- | -------------------------------------------------- |
| `DATABASE_URL`           | `/backend/.env`  | ✅ Created                                         |
| `DATABASE_PASSWORD`      | `/backend/.env`  | ✅ Created                                         |
| `VITE_API_URL`           | `/frontend/.env` | ✅ Created                                         |
| `VITE_DEMO_MODE`         | `/frontend/.env` | ✅ Created — `true` for demo, `false` for live API |
| `SECRET_KEY`             | `/backend/.env`  | ⬜ Add when auth is built                          |
| `PLAID_CLIENT_ID`        | `/backend/.env`  | ⬜ Phase 5                                         |
| `PLAID_SECRET`           | `/backend/.env`  | ⬜ Phase 5                                         |
| `TWILIO_ACCOUNT_SID`     | `/backend/.env`  | ⬜ Phase 5                                         |
| `TWILIO_AUTH_TOKEN`      | `/backend/.env`  | ⬜ Phase 5                                         |
| `TWILIO_WHATSAPP_NUMBER` | `/backend/.env`  | ⬜ Phase 5                                         |

---

## File Convention (every feature = 3 files)

**Rules:**

- `.jsx` files contain zero business logic and zero raw data
- `.js` files (api layer) contain zero JSX
- `.py` files are the only place that touches the database
- `MockData.js` is the only demo seed — never hardcode values in components
- `VITE_DEMO_MODE=true` serves MockData; `false` calls the real API

---

## Phase 1 — DB Foundation ✅ DONE

| File                      | Status  | Notes                                                           |
| ------------------------- | ------- | --------------------------------------------------------------- |
| `backend/app/database.py` | ✅ Done | SQLAlchemy engine + SessionLocal + get_db                       |
| `backend/app/models.py`   | ✅ Done | All models — see schema notes below                             |
| `backend/alembic/env.py`  | ✅ Done | Alembic configured, reads DATABASE_URL from .env                |
| Alembic migration run     | ✅ Done | `alembic upgrade head` confirmed — all tables exist in Supabase |

---

## Phase 2 — Transactions ✅ DONE

### Backend

| File                                  | Status  | Notes                                                            |
| ------------------------------------- | ------- | ---------------------------------------------------------------- |
| `backend/app/routers/transactions.py` | ✅ Done | GET, POST, PUT, DELETE + drafts/count endpoint                   |
| GET `/transactions` filters           | ✅ Done | `?category=`, `?type=`, `?is_draft=`, `?date_from=`, `?date_to=` |

### Frontend

| File                                  | Status  | Notes                                                         |
| ------------------------------------- | ------- | ------------------------------------------------------------- |
| `frontend/src/api/transactions.js`    | ✅ Done | axios wrappers: get, create, update, delete                   |
| `frontend/src/api/Transaction.js`     | ✅ Done | All logic + useTransactions() — exposes getCategoryConfig     |
| `frontend/src/pages/Transactions.jsx` | ✅ Done | Pure JSX — live colors from SettingsContext, savings handling |

---

## Phase 3 — Bills, Budget, Debts, Savings ✅ DONE

### Bills ✅

| File                           | Status  | Notes                                                                  |
| ------------------------------ | ------- | ---------------------------------------------------------------------- |
| `backend/app/routers/bills.py` | ✅ Done | GET, POST, PUT, DELETE — no Category creation, backbone row only       |
| `frontend/src/api/bills.js`    | ✅ Done | axios wrappers                                                         |
| `frontend/src/api/Bill.js`     | ✅ Done | useBills() — live expense categories from SettingsContext, live colors |
| `frontend/src/pages/Bills.jsx` | ✅ Done | Pure JSX — category dropdown from SettingsContext                      |

### Budget ✅

| File                               | Status  | Notes                                                                 |
| ---------------------------------- | ------- | --------------------------------------------------------------------- |
| `backend/app/routers/budget.py`    | ✅ Done | All three kinds (expense/income/savings), includes `kind` in response |
| `frontend/src/api/budget.axios.js` | ✅ Done | axios wrappers                                                        |
| `frontend/src/api/Budget.js`       | ✅ Done | All three kinds, animation disabled, useBudget()                      |
| `frontend/src/pages/Budget.jsx`    | ✅ Done | 4-tab redesign: All (Option B) / Expenses / Income / Savings          |

### Debts ✅

| File                           | Status  | Notes                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------- |
| `backend/app/routers/debts.py` | ✅ Done | GET, POST, PUT, DELETE, POST /pay — no Category creation      |
| `frontend/src/api/debts.js`    | ✅ Done | axios wrappers                                                |
| `frontend/src/api/Debt.js`     | ✅ Done | Currency-aware slider params, simulate() verified, useDebts() |
| `frontend/src/pages/Debts.jsx` | ✅ Done | Pure JSX — slider uses sliderParams from hook                 |

### Savings ✅

| File                             | Status  | Notes                                                          |
| -------------------------------- | ------- | -------------------------------------------------------------- |
| `backend/app/routers/savings.py` | ✅ Done | GET, POST, PUT, DELETE, PUT /contribute — no Category creation |
| `frontend/src/api/savings.js`    | ✅ Done | axios wrappers                                                 |
| `frontend/src/api/Saving.js`     | ✅ Done | pct, daysLeft, deadlineLabel, fmt, useSavings()                |
| `frontend/src/pages/Savings.jsx` | ✅ Done | Pure JSX                                                       |

---

## Architecture Decision — Cross-Module Interconnection ✅ IMPLEMENTED

> Original design in `INTERCONNECTION_ADR.md`. Final implementation differs from
> the original plan. Summary of what was actually built below.

**Final implementation: `budget_categories` as the backbone — not FK columns on each table.**

The interconnection is handled by a single backbone table (`budget_categories`) and a
sync service (`entity_sync.py`). The `categories` table stays clean — only expense,
income, and savings kinds exist and are managed exclusively through the Settings tab.

### How it works

**`budget_categories` — one row per entity event:**

| Column                       | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `transaction_id`             | FK → transactions. Null until bill is paid / payment recorded |
| `transaction_name`           | Display name ("Electric Bill", "Debt: Student Loan")          |
| `transaction_payment_method` | Null until confirmed                                          |
| `categories_name`            | Soft ref to `categories.name` — drives budget grouping        |
| `type`                       | Entity identifier: "Bill: X" / "Debt: X" / "Savings: X"       |
| `amount`                     | Kept in sync with the linked transaction                      |
| `date`                       | Kept in sync with the linked transaction                      |

**Category kinds (only 3 exist):**

| Kind      | Used by                               | User can create? |
| --------- | ------------------------------------- | ---------------- |
| `expense` | Spending categories, Debt Payments    | ✅ Yes           |
| `income`  | Salary, Side Income, Refund, etc.     | ✅ Yes           |
| `savings` | Single "Savings" row — system managed | ❌ No            |

**`entity_sync.py` — three sync functions:**

| Function                  | Called from                     | What it does                                                                                          |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `entity_to_transaction()` | `bills.py` after edit/toggle    | Pushes bill changes to linked transaction                                                             |
| `transaction_to_entity()` | `transactions.py` after PUT     | Pushes tx edits to hub + linked entity (bill category, debt balance, savings amount)                  |
| `reverse_transaction()`   | `transactions.py` before DELETE | Reverses entity effect: unmarks bill as paid / adds amount back to debt / subtracts from savings goal |

**Flows implemented and tested:**

- Bill CREATE → hub row created immediately (transaction_id null)
- Bill marked paid → draft transaction created + linked
- Bill edited → hub + linked transaction both updated
- Bill unmarked paid → transaction deleted, hub unlinked
- Debt payment recorded → hub + transaction created together
- Debt transaction edited → balance corrected via delta
- Savings contribution → hub + transaction created together
- Savings transaction edited → goal corrected via delta
- Any linked transaction DELETED → entity effect fully reversed

**⚠️ PENDING MIGRATION** — Run this before starting Phase 5:

```
alembic upgrade head
```

Migration file: `migration_remove_category_fks.py`
Removes: `bills.linked_category_id`, `debts.payment_category_id`, `savings_goals.contribution_category_id`
Updates: `category_kind` enum from 5 values → 3 values (expense / income / savings)
Also: delete any orphaned rows in `categories` with kind = `bill_payment`, `debt_payment`, or `savings_contribution`

---

## Phase 4 — Settings + Dashboard ✅ DONE

### Backend

| File                                  | Status  | Notes                                                                   |
| ------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `backend/app/routers/categories.py`   | ✅ Done | GET, POST, PUT, DELETE, POST /seed — 3 kinds only                       |
| `backend/app/routers/preferences.py`  | ✅ Done | GET /preferences (auto-seeds defaults), PUT /preferences                |
| `backend/app/routers/summary.py`      | ✅ Done | GET /summary, GET /cashflow (includes savings), GET /expenses/breakdown |
| `backend/app/routers/budget.py`       | ✅ Done | All 3 kinds returned, optional ?kind= filter on /actuals                |
| `backend/app/routers/transactions.py` | ✅ Done | GET /drafts/count, auto-clears is_draft when payment_method confirmed   |
| `backend/app/services/entity_sync.py` | ✅ Done | entity_to_transaction, transaction_to_entity, reverse_transaction       |
| `backend/app/models.py`               | ✅ Done | category_kind enum = expense/income/savings only                        |

### Frontend

| File                                       | Status  | Notes                                                                     |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------- |
| `frontend/src/api/settings.axios.js`       | ✅ Done | axios wrappers for categories + preferences                               |
| `frontend/src/api/Settings.js`             | ✅ Done | 4 tabs (All/Expense/Income/Savings), canAddOnTab logic, useSettingsPage() |
| `frontend/src/pages/Settings.jsx`          | ✅ Done | Pure JSX — 4-tab category manager, kind badges, system row protection     |
| `frontend/src/context/SettingsContext.jsx` | ✅ Done | expenseCategories, incomeCategories, savingsCategories, getCategoryConfig |
| `frontend/src/api/Dshboard.js`             | ✅ Done | All 6 API calls parallel, budget rows expense-only, useDashboard()        |
| `frontend/src/pages/Dashboard.jsx`         | ✅ Done | Pure JSX — unchanged structure                                            |
| `frontend/src/App.jsx`                     | ✅ Done | Draft badge on Transactions nav (5s poll + refresh on nav click)          |

---

## Single-User Testing ✅ DONE

Tested locally with `VITE_DEMO_MODE=false` against live Supabase. All flows verified:

- Bills: create, mark paid (draft tx), confirm payment, edit from both tabs, unmark paid, delete
- Debts: create, record payment, edit payment from tx tab (balance corrects), delete tx (balance restored)
- Savings: create goal, contribute (draft tx), confirm payment, edit from tx tab (goal corrects), delete tx (goal reverts)
- Budget: all 3 kinds display, planned amounts save, actuals aggregate correctly
- Settings: category CRUD, color changes reflect immediately across all views
- Dashboard: KPIs, cashflow chart (includes savings), donut, budget progress (expense only)
- Transactions: filter by All/Income/Expense/Savings, draft badge, savings rows locked

**Known issues deferred to Phase 5 / multi-user testing:**

- CSV/Excel import not yet implemented (stubs in Settings.js)
- Banking API auto-categorization for savings transactions — needs design decision before implementing (see note below)

---

## ⚠️ IMPORTANT FUTURE DECISION — CSV Import & Banking API + Savings

When CSV import and banking API sync land in Phase 5, a decision is needed:

> When a transaction comes in from CSV or bank API that looks like a savings
> transfer (e.g. "Transfer to savings account"), how does the system know
> which savings goal it belongs to, or whether it is a savings transaction at all?

**Two options to evaluate in Phase 5:**

**Option A — Manual mapping after import.** Imported transactions land as regular
expense transactions. The user reassigns any savings-related ones manually.
Simple but requires user intervention.

**Option B — Rule-based auto-categorization.** User defines rules such as
"transactions from account X or with description matching Y → Savings goal Z".
More powerful but more complex to build.

**Do not implement either option before Phase 5 starts.** Keep this note visible.

---

## Phase 5 — Advanced Features ⬜ NOT STARTED

### Smart Alerts

| File                            | Status     | Notes                                                               |
| ------------------------------- | ---------- | ------------------------------------------------------------------- |
| `backend/app/alert_engine.py`   | ⬜ Missing | Evaluate 4 rules: over_budget, spending_spike, bill_due, near_limit |
| `backend/app/routers/alerts.py` | ⬜ Missing | GET /alerts, PUT /alerts/{id}/read, DELETE /alerts/{id}             |
| `frontend/src/api/Alerts.js`    | ⬜ Missing | Extract logic from Alerts.jsx, useAlerts() hook                     |
| `frontend/src/pages/Alerts.jsx` | ⚠️ Partial | Currently config UI only — needs live alert list wired in           |

### Banking API Sync

| File                            | Status     | Notes                                                       |
| ------------------------------- | ---------- | ----------------------------------------------------------- |
| `backend/app/routers/sync.py`   | ⬜ Missing | POST /sync/connect, POST /sync/trigger, GET /sync/status    |
| `backend/app/categorization.py` | ⬜ Missing | Rules engine: standardize merchant names, assign categories |
| Cron job on Render              | ⬜ Missing | Daily trigger for sync                                      |
| Banking API decision            | ⬜ Pending | Plaid vs GoCardless vs TrueLayer — depends on country/bank  |

### Export + Notifications

| File                            | Status     | Notes                                                                      |
| ------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `backend/app/routers/export.py` | ⬜ Missing | GET /transactions/export?format=csv\|xlsx, GET /reports/monthly?format=pdf |
| `backend/app/notifications.py`  | ⬜ Missing | Twilio WhatsApp + SMS dispatch                                             |

### CSV / Excel Import

| File                            | Status     | Notes                                                                 |
| ------------------------------- | ---------- | --------------------------------------------------------------------- |
| `backend/app/routers/import.py` | ⬜ Missing | POST /transactions/import — parse CSV/Excel, map columns, bulk insert |
| Frontend import modal           | ⬜ Missing | Column mapper UI, preview before confirm                              |

---

## Auth — Planned (post Phase 5)

| Task                                       | Status     | Notes                                                                             |
| ------------------------------------------ | ---------- | --------------------------------------------------------------------------------- |
| Choose auth strategy                       | ⬜ Pending | JWT (DIY) vs Supabase Auth — Supabase Auth recommended                            |
| `backend/app/routers/auth.py`              | ⬜ Missing | POST /auth/register, POST /auth/login, POST /auth/refresh                         |
| `SECRET_KEY` in `/backend/.env`            | ⬜ Missing | Add when auth is built                                                            |
| Add Authorization header to `client.js`    | ⬜ Missing | One-line change, all API calls inherit it                                         |
| Protect all FastAPI routes with dependency | ⬜ Missing | `Depends(get_current_user)` on every router                                       |
| Add `user_id` FK to all tables             | ⬜ Missing | Bills, Debts, SavingsGoals, Transactions, BudgetCategory, Categories, Preferences |

---

## Quick Status Summary

| Phase                                | Status                                       |
| ------------------------------------ | -------------------------------------------- |
| 1 · DB Foundation                    | ✅ Done                                      |
| 2 · Transactions                     | ✅ Done                                      |
| 3 · Bills / Budget / Debts / Savings | ✅ Done                                      |
| 4 · Settings + Dashboard             | ✅ Done                                      |
| Single-user testing                  | ✅ Done                                      |
| Pending migration                    | ⚠️ Run `alembic upgrade head` before Phase 5 |
| 5 · Alerts / Sync / Export / Import  | ⬜ Not started                               |
| Auth                                 | ⬜ Planned — after Phase 5                   |

---

## How to Use This File in a New Conversation

Start with:

> "Here is my project tracker — [paste file]. I want to work on Phase 5.
> Phases 1–4 are complete and single-user tested. The pending Alembic migration
> has been run. `VITE_DEMO_MODE=false` is confirmed working against live Supabase."

Then name the specific feature, e.g.:

- "Let's build the Smart Alerts backend — alert_engine.py and the alerts router"
- "Let's wire up the CSV import flow"
- "Let's start the Banking API integration decision and sync router"
