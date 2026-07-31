# FinanceOS — Build Tracker

> Paste this file at the start of any new conversation to resume context.  
> Update the status column as each item is completed.  
> Stack: React + FastAPI + PostgreSQL (Supabase) + Chart.js

---

## 📋 Current Priorities (as of 2026-07-29)

After a few months of small-group testing (3–4 users), three real problems surfaced: manual
entry felt like a chore with no automatic sync, Supabase kept "closing" (pausing), and Telegram
alerts stopped after one initial test message. Root causes were diagnosed and a sequenced plan
was agreed. **Work one item at a time, in order — each step's findings shape the next one, so
don't skip ahead.**

> ✅ **Resolved (2026-07-29) — leaked DB password on the public GitHub repo.** Password rotated,
> Render's `DATABASE_URL` updated, `Tracker.md` redacted and pushed, gitleaks pre-commit hook
> installed. Full checklist under "Environment Variables." Next up: item #1 below.

| # | Item | Status | Details |
|---|------|--------|---------|
| 1 | **Reliability fix** — replace broken cron, stop Supabase pausing | ✅ Done (2026-07-30) | Confirmed end-to-end via manual Actions trigger — see "Reliability & Ops" below |
| 2 | **Supabase Security Advisor review** — check Database → Advisors for actual RLS/security warnings | ✅ Done (2026-07-30) | RLS enabled on all 12 public tables, no policies (not needed — see "Supabase Security Advisor Review" below) |
| 3 | **Codebase orphan/dead-code audit** — find unused fields, dead functions, stale logic (e.g. the `is_draft`/`reviewed` confusion, see "Known Gotchas") | ⬜ Not started | Needs a real file-by-file pass, not a skim. **Also check:** the "digest" naming in code/UI against the 3-type notification model — see "Notification Model — 3 Types" note under Phase 5. **Also check:** `earmarked_funds` table — not referenced anywhere in this schema, likely orphaned (found during Security Advisor review, 2026-07-30). **Also check:** Alerts "Dismiss" button doesn't actually remove the alert (found 2026-07-30) — see "Known Bugs" below |
| 4 | **Docs overhaul** — bring every `.md` file in line with actual repo state | ⬜ Not started | Do this *after* the audit (#3), not before, so it isn't stale again immediately |
| 5 | **Database normalization + scalability** | ⬜ Not started | Tied to Cesar's coursework — do this collaboratively, explain reasoning, don't just hand over a schema diff. **Also fold in:** unindexed FK / unused index cleanup from Security Advisor (2026-07-30) — see below |
| 6 | **Email ingestion pipeline (bank-transaction automation)** | ⬜ Design agreed, not built | See "Email Ingestion Pipeline" below — build after the schema settles |

**Why this order:** reliability first because nothing else can be tested reliably while Supabase
keeps pausing mid-session. Security Advisor before normalization because it's five minutes of
looking at real data instead of guessing. Codebase audit before docs because docs written against
an un-audited codebase go stale again immediately. Normalization/scalability before the email
pipeline because the pipeline writes into that schema — better to build it against the settled
shape.

---

## 🚀 Deployment Checklist (Render + Vercel)

### Step 1 — Push to GitHub
Commit all changes and push to your GitHub repo. Both Render and Vercel deploy from Git.

> ⚠️ Confirm `.env` files are NOT committed — both `.gitignore` files exclude them.

### Step 2 — Deploy Backend to Render

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Set **Root Directory** to `Backend`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Set these **Environment Variables** in the Render dashboard:

| Variable              | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`        | *(copy from Render dashboard — **do not paste real credentials into this file**; see note below)* |
| `SUPABASE_URL`        | `https://nbbxpozqrzbxyealvpxs.supabase.co`                  |

> ⚠️ **Security incident (2026-07-29) — leaked DB password. Do this FIRST next session, before
> anything else on the priorities list. Checklist:**
>
> This row previously contained the real Supabase database password in plaintext. **The GitHub repo
> is PUBLIC** (corrected 2026-07-29 — initially thought private). Public repos are actively scanned
> by bots hunting for exposed credentials, often within minutes of a push — this is independent of
> the repo's own view count, so "nobody's looked at it" doesn't reduce the risk here. Public repos
> do get GitHub's free secret-scanning automatically, so check Settings → Security → Secret scanning
> alerts on the repo — it may have already flagged this connection string.
>
> - [x] **Rotate now (2026-07-29)** — done via Supabase dashboard → Settings → Database → Reset
>       database password. This was the step that actually mattered; everything below is cleanup/prevention.
> - [x] **Update `DATABASE_URL` on Render (2026-07-29)** — done, backend reconnected with the new password.
> - [x] **Checked GitHub's Secret Scanning alerts (2026-07-29)** — zero open, zero closed; code
>       scanning also not enabled. A generic Postgres connection string isn't one of GitHub's
>       recognized partner secret patterns (those are mostly vendor-specific, e.g. AWS/Stripe keys),
>       so it was never auto-flagged. **This does not reduce urgency** — it just means nothing was
>       ever going to catch this automatically. Rotation is still the only real fix.
> - [x] **Redacted `Tracker.md` and pushed (2026-07-29)** — commit `4c2ff0f "updated tracker leak"`.
>       Current HEAD on GitHub no longer contains the plaintext password.
> - [ ] *(Skipped, by decision 2026-07-29)* Scrub git history with `git filter-repo` — old password is
>       dead once rotated, and a force-push would break other local clones. Not worth it. The password
>       stays visible in old commits but is inert.
> - [x] **Prevent recurrence (2026-07-29)** — `gitleaks` pre-commit hook installed at
>       `.git/hooks/pre-commit`. Blocks commits containing likely secrets once `gitleaks` itself is
>       installed locally (`winget install gitleaks` / `scoop install gitleaks`) — until then it warns
>       but doesn't block. Still worth a manual second look through the repo for other pasted
>       credentials during the codebase audit (item #3).
>
> This should also feed into the Security Advisor review (item #2 above) once that's done.
>
> **✅ Security incident closed (2026-07-29).** Password rotated, Render updated, leak removed from
> HEAD, prevention hook in place. Ready to move to item #1 (Reliability fix) next.
| `SUPABASE_JWT_SECRET` | *(copy from Backend/.env)*                                   |
| `ALLOWED_ORIGINS`     | *(leave blank for now — add Vercel URL in Step 4)*           |
| `CRON_SECRET`         | *(any random string, e.g. generate one at random.org)*       |

7. Deploy → copy the URL once live (e.g. `https://financeos.onrender.com`)

### Step 3 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set **Root Directory** to `frontend`
3. Framework will auto-detect as Vite ✅
4. Set these **Environment Variables** in the Vercel dashboard:

| Variable               | Value                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `VITE_API_URL`         | `https://financeos.onrender.com` ← your Render URL from Step 2       |
| `VITE_SUPABASE_URL`    | `https://nbbxpozqrzbxyealvpxs.supabase.co`                           |
| `VITE_SUPABASE_ANON_KEY` | *(copy from frontend/.env)*                                         |

5. Deploy → copy the URL once live (e.g. `https://financeos.vercel.app`)

### Step 4 — Wire the two services together

1. Back in Render → your web service → Environment tab
2. Add `ALLOWED_ORIGINS` = `https://financeos.vercel.app` ← your Vercel URL from Step 3
3. Render will restart automatically

### Step 5 — Verify it's working

- Open your Vercel URL → should see the login page
- Register / sign in via Supabase Auth
- Check the browser Network tab — API calls should go to your Render URL and return 200s
- Open `https://financeos.onrender.com/docs` → should show the FastAPI Swagger UI

### Step 6 — Run Alembic migrations (if not already done)

If you haven't run `alembic upgrade head` since the Phase 5 alert migrations:
```bash
cd Backend
alembic upgrade head
```
The Supabase DB is shared between local and production so this only needs running once.

---

## Environment Variables

| Variable                 | Location                                    | Status                                                        |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`           | Backend `.env` + Render                     | ✅ Set                                                        |
| `SUPABASE_URL`           | Backend `.env` + Render                     | ✅ Set                                                        |
| `SUPABASE_JWT_SECRET`    | Backend `.env` + Render                     | ✅ Set                                                        |
| `ALLOWED_ORIGINS`        | Render only                                 | ⬜ Set to your Vercel URL after frontend is deployed          |
| `VITE_API_URL`           | Vercel only (not in .env file)              | ⬜ Set to your Render URL after backend is deployed           |
| `VITE_SUPABASE_URL`      | frontend `.env` + Vercel                    | ✅ Set                                                        |
| `VITE_SUPABASE_ANON_KEY` | frontend `.env` + Vercel                    | ✅ Set                                                        |
| `CRON_SECRET`            | Backend `.env` + Render                     | ❌ **Corrected 2026-07-30** — variable existed on Render but value was empty, meaning `/scheduler/run` had zero auth protection (`alert_scheduler.py` skips the check when the secret is falsy). Fresh value generated and set 2026-07-30 — also added as a GitHub Actions repo secret with the same value. |
| `BACKEND_URL`            | Render cron service only                    | ❌ **Missing** — cron's `startCommand` falls back to `http://localhost:8000`, which resolves to nothing inside the cron container. Likely cause of "zero notifications since the one test." |
| `PLAID_CLIENT_ID`        | Backend `.env` + Render                     | ⬜ On hold — bank sync path blocked, see "Banking API Sync"   |
| `PLAID_SECRET`           | Backend `.env` + Render                     | ⬜ On hold — same as above                                    |
| `TELEGRAM_BOT_TOKEN`     | Backend `.env` + Render                     | ✅ Set on Render (confirmed 2026-07-29) — value not yet verified as working end-to-end |
| `VAPID_PUBLIC_KEY`       | Backend `.env` + Render + frontend + Vercel | ⬜ Not yet generated                                          |
| `VAPID_PRIVATE_KEY`      | Backend `.env` + Render only                | ⬜ Never expose to frontend                                   |
| `VAPID_CONTACT_EMAIL`    | Backend `.env` + Render only                | ⬜ After VAPID key generation                                 |

> Note: `ALERTS_SPEC.md` and `INTERCONNECTION_ADR.md` are referenced throughout this file (and in
> code comments) but do not currently exist in the repo. Either they were never committed or were
> lost at some point — flag this during the codebase audit (#3 above) and either recreate them or
> stop referencing them.

---

## 🛠️ Reliability & Ops (new — 2026-07-29)

**Problem 1 — Telegram notifications never fire automatically.** `render.yaml` defines
`financeos-daily-scheduler` as a Render Cron Job on `plan: free` — but Render does not offer a
free tier for Cron Jobs (they start at $1/mo). The job likely never deployed at all. Even if it
had, its `startCommand` posts to `BACKEND_URL`, which was never set on Render, so it would have
defaulted to `http://localhost:8000` and failed silently inside its own empty container. The one
Telegram message ever received was from the manual `POST /alerts/telegram/test` endpoint, which
doesn't depend on the cron at all.

**Problem 2 — Supabase keeps "closing."** Confirmed: Supabase free-tier projects pause after 7
days of zero API activity — this is a project-wide pause, not just a dropped connection, and nothing
works again until it's manually restored. The existing UptimeRobot ping only hits Render's `/ping`
to keep the *web service* warm; it never touches Supabase, so the 7-day timer runs independently
and unaffected.

**Fix (staying on the free tier, per decision on 2026-07-29):** replace the Render Cron Job with a
free GitHub Actions scheduled workflow that POSTs to `/scheduler/run` daily (with retries — Render
free-tier cold starts take ~30–50s). This one job solves both problems at once: it wakes the
sleeping Render service, it exercises the DB via `run_daily_checks()` (resetting Supabase's 7-day
pause timer), and it's the same code path that dispatches Telegram/digest alerts — so fixing the
trigger also fixes the notification silence.

**Implementation status (2026-07-30):**
1. [x] Added `.github/workflows/daily-scheduler.yml` — scheduled (08:00 UTC daily) + manually
   triggerable (`workflow_dispatch`, for testing) `curl` POST to `${{ secrets.BACKEND_URL }}/scheduler/run`
   with header `x-cron-secret: ${{ secrets.CRON_SECRET }}`. Retries 6x with 15s delay on any error
   (`--retry-all-errors`) to ride out Render's free-tier cold start.
2. [x] `BACKEND_URL` and `CRON_SECRET` set as GitHub repo secrets (2026-07-30) — same values as Render.
   Along the way found `CRON_SECRET` on Render was set but **empty** (zero auth on `/scheduler/run`
   until fixed) — generated a fresh value, set on both Render and GitHub.
3. [x] Removed the `cron:` block from `Backend/render.yaml` (replaced with a comment pointing to
   the GitHub Actions workflow) — it never deployed anyway since Render Cron has no free tier.
4. [x] Added `BACKEND_URL` to Render (both the `render.yaml` reference and the actual dashboard value).
5. [x] **Manually triggered the GitHub Actions workflow (2026-07-30) — confirmed working end-to-end.**
   Render woke up, `run_daily_checks()` ran, Telegram messages arrived. This is also the real-world
   test for Step 11 below — closing that out too.

**🟢 Reliability fix confirmed working (2026-07-30).** Daily automatic run (08:00 UTC) is now live via
GitHub Actions. Moving to item #2 (Supabase Security Advisor review) next.

---

## 🔒 Supabase Security Advisor Review (2026-07-30)

Checked Database → Advisors. Findings and decisions below.

**ERROR — RLS disabled on all 12 public tables** (`alembic_version`, `earmarked_funds`, `categories`,
`transactions`, `debts`, `recurring_transactions`, `bills`, `preferences`, `savings_goals`, `alerts`,
`alert_preferences`, `budget_categories`). Real risk: Supabase auto-exposes every public table via
PostgREST, and the frontend ships `VITE_SUPABASE_ANON_KEY` in the built JS bundle (readable by
anyone via devtools). With RLS off, that public anon key could query any of these tables directly
through the PostgREST endpoint — completely bypassing FastAPI's JWT auth and `user_id` scoping.

- [x] **Fixed (2026-07-30)** — RLS enabled on all 12 tables via the Supabase dashboard.
- [x] **Decision: no policies added.** With RLS on and zero policies, access defaults to deny for
      every role except the table owner. `DATABASE_URL` connects as the `postgres` role (table
      owner), which bypasses RLS automatically — FastAPI keeps working unchanged. Nothing in the
      app queries Supabase directly for data (only for Auth), so there's no legitimate path that
      needs a policy right now.
- [ ] **If this changes** (e.g. frontend ever queries Supabase directly instead of going through
      FastAPI) — policies will be needed then, e.g. `auth.uid() = user_id` per table. Not needed today.
- [x] Re-ran the Advisor after enabling RLS — confirmed clear.

**WARN — Leaked Password Protection disabled.** Separate issue from the 2026-07-29 DB password leak
incident (that was *our* Supabase connection string being exposed on GitHub, already resolved). This
is a different Supabase Auth feature — checks *end-user* signup passwords against HaveIBeenPwned.
Still off. Low priority (WARN, not ERROR) — revisit later, toggle lives in Auth → Settings.

**INFO (performance, not security)** — unindexed FKs on `bills` (×2), `debts` (×2), `transactions`,
`budget_categories`; unused `ix_*_user_id` indexes on `recurring_transactions`, `transactions`,
`budget_categories`, `bills`, `debts`, `categories`. Folded into item #5 (normalization) — see that
row above.

**Orphan flagged:** `earmarked_funds` table exists in the DB but isn't referenced anywhere in this
tracker's schema section. Added to item #3 (codebase audit).

**✅ Item #2 closed (2026-07-30).** Moving to item #3 (codebase orphan/dead-code audit) next.

---

## 🐛 Known Bugs — Backlog (unscheduled)

Found incidentally, not yet triaged into a numbered priority item.

- **Alerts "Dismiss" button doesn't delete the alert** (found 2026-07-30, while spot-checking
  notifications after the Security Advisor pass). Clicking dismiss doesn't remove it from the feed.
  Needs investigation — check whether `frontend/src/pages/Alerts.jsx` is calling the right endpoint
  and whether `backend/app/routers/alerts.py`'s DELETE actually fires. Flagged for item #3 audit.
- **Demo mode data is calendar-hardcoded, goes stale over time.** `MockData.js` seeds fixed dates —
  as real time passes those months fall out of any "current month" filtering, so the demo dashboard
  stops showing data even though it's supposed to always look populated. Needs demo data generated
  relative to the current date instead of fixed calendar dates. Not urgent, not tied to current
  priorities — just don't forget it.

---

## 📥 Email Ingestion Pipeline (planned — replaces live bank sync for now)

**Why not Plaid / GoCardless / TrueLayer:** evaluated during the original Phase 6 attempt (see
corrected "Banking API Sync" history below). Direct bank API access was refused outright. The
aggregators either didn't support the specific banks in use, or required an OAuth flow to an
unfamiliar third party that testers (friends/family, not just Cesar) weren't comfortable
authorizing. Decision: don't keep chasing aggregator coverage — build a bridge instead.

**Design:**
- One dedicated Gmail inbox, using Gmail's `+alias` addressing so every user gets a unique
  ingestion address (`financeos.ingest+<token>@gmail.com`) without needing separate mailboxes or
  per-user credentials. Each user sets a one-time forward rule from their bank's transaction email
  to their own alias.
- New backend module `email_ingest.py`, split into two deliberately separate pieces:
  1. `parse_bank_email(sender, subject, body) -> dict | None` — pure function, no network calls,
     unit-testable against saved fixture emails (capture one real example per bank once, reuse
     forever — no need to trigger real transactions to test the parser).
  2. A poller (rides the same GitHub Actions cron, tighter interval e.g. every 15–30 min) that
     authenticates to the Gmail inbox via the Gmail API, resolves the `+alias` to a `user_id`,
     hands the body to the parser, and creates the transaction.
- **Field semantics (see "Known Gotchas" below):** email-imported transactions are created as
  *real, complete* transactions immediately — `is_draft=False` (the money already left the
  account; the email is the bank's own confirmation) — with `source='email_import'` (needs adding
  to the `source` enum in `models.py`) and `reviewed=False`. This reuses the existing
  `import_reminder` alert machinery already built for CSV imports — no new mechanism needed.
- Payment-method variance (e.g. QR payments include merchant name, masked-card payments don't) is
  handled by the parser writing a less-confident description when detail is missing (e.g. "Card
  purchase — •••1234", no category guess) — still `reviewed=False` either way, just less filled in.
- **Known limitation:** banks that only send monthly statements (not per-transaction emails) fall
  through this pipeline entirely — those users stay on manual entry, or the SMS-forwarding
  alternative (iOS Shortcuts automation, or MacroDroid/Tasker on Android) discussed but not chosen
  as the primary path.
- Not yet built — will be scoped as its own session after the schema work.

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

## Phase 5 — Advanced Features 🔄 IN PROGRESS

### Smart Alerts — Steps 1–7 complete ✅

| File                                  | Status  | Notes                                                                                        |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `backend/alembic/versions/a1b2…`      | ✅ Done | Migration: source enum + reviewed + last_seen_at                                             |
| `backend/alembic/versions/b2c3…`      | ✅ Done | Migration: alerts + alert_preferences tables                                                 |
| `backend/app/models.py`               | ✅ Done | Alert + AlertPreferences models added; Transaction.reviewed + Preferences.last_seen_at added |
| `backend/app/alert_engine.py`         | ✅ Done | All 8 rule types; source-aware routing; Tier 1 immediate dispatch stub                       |
| `backend/app/alert_scheduler.py`      | ✅ Done | Daily cron runner + POST /scheduler/run HTTP trigger                                         |
| `backend/app/notifications.py`        | ✅ Done | Stub — functions defined, no-ops until Step 9 (TELEGRAM_BOT_TOKEN + VAPID keys)             |
| `backend/app/routers/alerts.py`       | ✅ Done | GET /alerts, unread-count, PUT read/read-all, DELETE, GET/PUT preferences, Telegram, PWA    |
| `frontend/src/api/alerts.js`          | ✅ Done | Axios wrappers (lowercase)                                                                   |
| `frontend/src/api/Alerts.js`          | ✅ Done | useAlerts() hook, formatRelativeTime, getSeverityConfig, getAlertIcon, fetchUnreadCount      |
| `frontend/src/pages/Alerts.jsx`       | ✅ Done | Section 1: live feed (unread first). Section 2: channel cards + thresholds + digest settings |
| `frontend/src/App.jsx`                | ✅ Done | Sidebar badge wired to live unread count (polls every 30s)                                   |
| `frontend/src/data/MockData.js`       | ✅ Done | DEMO_ALERT_FEED + DEMO_ALERT_PREFERENCES added                                               |

**Status as of 2026-07-29** (corrected — `notifications.py` and channel routing are actually
already implemented in code; what's missing is the *trigger*, not the dispatch logic):

| Step | What | Status |
| ---- | ---- | ------ |
| 8A | Create Telegram bot via @BotFather → add TELEGRAM_BOT_TOKEN | ✅ Done — confirmed set on Render 2026-07-29 |
| 8B | Run `npx web-push generate-vapid-keys` → add VAPID keys | ⬜ Not done — PWA push untested |
| 9  | `notifications.py` (Telegram + PWA push) | ✅ Already implemented — not a stub |
| 10 | Notifications wired into `alert_engine.py` channel routing (`_dispatch_immediate`) | ✅ Already implemented |
| 11 | Telegram end-to-end test | ✅ Done (2026-07-30) — automatic dispatch confirmed via manual GitHub Actions trigger, messages received |
| 12 | PWA Push service worker (`frontend/public/sw.js`) | ⬜ Not done |
| 13 | Telegram categorization assistant | ⬜ On hold — depends on the email ingestion pipeline instead of "bank API" now |

**Run migrations before testing:**
```
alembic upgrade head
```

### Notification Model — 3 Types (clarified 2026-07-30, design note — nothing built from this yet)

Discussed to sort out confusion between "digest," "tiers," and what the user actually experiences.
Cesar's 3-type model is the correct mental model going forward — **not** tiers, tiers are an
internal implementation detail of Type 1 below.

**Type 1 — Financial info alerts.** Everything currently in `alert_engine.py`: bill due, low
balance, debt overdue, budget exceeded, spending spike, import reminder. ✅ Built and working.
Internally split into Tier 1 (fires immediately per event, e.g. bill due) and Tier 2 (held and
bundled into one once-daily message, only sent if something's actually pending — confirmed in
code, `_send_digest()` returns early if nothing's queued). **Important terminology correction:**
what the code and UI currently call "the digest" is just this Tier 2 bundling/timing mechanism —
it is NOT Type 2 below, despite the name similarity. This caused real confusion in this session and
will again unless renamed or clearly re-labeled during the audit (see note at bottom).

**Type 2 — The resume.** A period-end summary/recap — user picks the cadence (monthly, quarterly,
etc.) — that narratively summarizes how the period went (spending vs. plan, savings progress, etc.)
and may or may not fold in whichever Type 1 items fired during that window. **Does not exist in
code at all.** No model field, no assembly function, nothing — not even a stub. Open design
questions, unresolved:
- Format: rigid preset template vs. something more fluid/generated per period — Cesar flagged this
  specifically as needing more thought, not decided.
- Whether/how it references Type 1 alerts that fired during the period, or stands alone.
- Cadence storage — needs its own preference field; `periodic_review_freq` (Type 3, below) is
  a different setting and shouldn't be reused/conflated for this.

**Type 3 — The review reminder.** A nudge to sit down and redo your budgeting (monthly / quarterly
/ semester) so the system's numbers stay accurate. ✅ Built — `periodic_review_freq` on
`AlertPreferences`, evaluated in `_check_periodic_review()`. Known limitation: only supports those
three fixed cadences, no custom period for users with bigger/different budgeting cycles.

**Next steps (not scheduled yet — revisit when alerts come back up as a work item):**
- Design Type 2 properly (content + cadence field) before building it.
- During the codebase/orphan audit (item #3 in Current Priorities): re-check the "digest" naming
  in code/UI against this 3-type model and decide whether to rename it (e.g. to
  `tier2_bundle_enabled` or similar) so it stops colliding with Type 2's "resume" concept in
  conversation and in the UI copy.

---

### Banking API Sync — attempted, blocked, pivoted (corrected 2026-07-29)

**This was not simply "not started."** It was attempted during Phase 6 and hit real walls:
1. Direct bank API access was requested and refused outright by the bank(s) in question.
2. Plaid / GoCardless / TrueLayer were evaluated as aggregator alternatives. Result: some didn't
   support the specific banks in use (coverage gap), and where they did, testers (friends/family,
   not just Cesar) weren't comfortable authorizing an unfamiliar third party via OAuth with real
   bank credentials.

**Decision:** don't keep chasing aggregator coverage for now. Building the email-ingestion
pipeline instead (see section above) as a lower-trust-barrier, zero-cost bridge. Live bank sync
stays on the table as a future revisit, not abandoned, just not the near-term path.

| File                             | Status              | Notes                                                       |
| --------------------------------- | -------------------- | ----------------------------------------------------------- |
| `backend/app/routers/sync.py`    | ⬜ On hold           | Superseded near-term by the email ingestion pipeline         |
| `backend/app/categorization.py`  | ⬜ On hold           | Rules engine — relevant to the email ingestion parser too    |
| Cron job on Render                | ❌ Replacing         | Render Cron has no free tier — moving to GitHub Actions (see Reliability & Ops) |
| Banking API decision              | ✅ Decided (paused)  | Plaid/GoCardless/TrueLayer ruled out for now — see history above |

### Export + Notifications

| File                            | Status     | Notes                                                                      |
| ------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `backend/app/routers/export.py` | ✅ Done    | Exists in repo (`export.py`) — GET /transactions/export, GET /reports/monthly |
| `backend/app/notifications.py`  | ✅ Done    | Telegram + PWA push implemented. Twilio WhatsApp/SMS still not built        |

### CSV / Excel Import

| File                                   | Status     | Notes                                                                 |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `backend/app/routers/import_router.py` | ✅ Done    | Exists in repo — actual filename is `import_router.py`, not `import.py` |
| Frontend import modal                    | ✅ Done    | Per Phase 5 status summary — reverify during codebase audit           |

---

## Auth ✅ DONE (Supabase Auth + FastAPI JWT)

Auth is fully implemented. No further work needed for multi-user testing.

| Task                                       | Status     | Notes                                                          |
| ------------------------------------------ | ---------- | -------------------------------------------------------------- |
| Choose auth strategy                       | ✅ Done    | Supabase Auth (email/password) — no custom auth server needed  |
| Login / register UI                        | ✅ Done    | `frontend/src/pages/Login.jsx` — sign in + sign up + demo mode |
| JWT sent on every API call                 | ✅ Done    | `frontend/src/api/client.js` — Axios request interceptor       |
| Backend JWT verification                   | ✅ Done    | `backend/app/dependencies.py` — ES256 via JWKS + HS256 fallback|
| All FastAPI routes protected               | ✅ Done    | `Depends(get_current_user)` on every endpoint                  |
| `user_id` FK on all tables                 | ✅ Done    | All models have `user_id` column — data is fully user-scoped   |
| Demo mode (no auth)                        | ✅ Done    | `isDemo` flag in AuthContext — uses MockData, no API calls     |

---

## ⚠️ Known Gotchas / Field Semantics

**`is_draft` vs. `reviewed` on `Transaction` (models.py) — do not conflate these.** They look
similar but solve unrelated problems:

- **`is_draft`** — scoped to the bill/debt/savings entity-linking flow in `entity_sync.py`. A bill
  marked "paid" creates a linked transaction that stays a draft until the payment method is
  confirmed; clearing it drives balance/debt/goal updates on the linked entity. Default `False`.
- **`reviewed`** — for transactions whose *data* needs a second look, not their existence. Default
  `True` for manual entries; set `False` for `csv_import` (and should be set `False` for the
  planned `email_import` source too). The existing `import_reminder` alert already watches for
  `reviewed == False`.

Early confusion between these two is likely what's remembered as "we removed drafts because they
caused sync issues" — they weren't removed, they were split apart, and the split is correct. Any
new automated-ingestion source (email, future bank sync) should set `is_draft=False` /
`reviewed=False`, never touch `is_draft=True` unless it's actually creating a bill/debt/savings
linked payment. Flag any code still confusing the two during the codebase audit (#3 above).

---

## Quick Status Summary

| Item                                          | Status                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| 1 · DB Foundation                              | ✅ Done                                                           |
| 2 · Transactions                               | ✅ Done                                                           |
| 3 · Bills / Budget / Debts / Savings           | ✅ Done                                                           |
| 4 · Settings + Dashboard                       | ✅ Done                                                           |
| Auth (Supabase JWT)                            | ✅ Done                                                           |
| Single-user testing                            | ✅ Done                                                           |
| 5 · Alerts (Steps 1–7)                         | ✅ Done                                                           |
| 5 · Export (CSV + XML)                         | ✅ Done                                                           |
| 5 · CSV/XLSX Import wizard                     | ✅ Done                                                           |
| Deployment (Render + Vercel)                   | ✅ Live — small-group testing ran for ~1 month                    |
| Multi-user live testing                        | 🔄 Ran, surfaced the reliability + friction issues tracked above  |
| 6 · Banking API Sync (Plaid/GoCardless/TrueLayer) | ❌ Attempted, blocked — see "Banking API Sync" — pivoted to email ingestion |
| Notifications (Telegram + PWA)                 | ✅ Telegram confirmed firing automatically (2026-07-30); PWA push still untested (VAPID keys not generated) |
| Reliability fix (cron → GitHub Actions)         | ✅ Done (2026-07-30) — confirmed end-to-end                       |
| Supabase Security Advisor review                | ✅ Done (2026-07-30) — RLS enabled on all 12 tables, no policies needed |
| Codebase orphan/dead-code audit                 | ⬜ Not started                                                    |
| Docs overhaul                                    | 🔄 This pass (2026-07-29) — ongoing                               |
| Database normalization + scalability            | ⬜ Not started — own session, tied to coursework                  |
| Email ingestion pipeline                        | 🔄 Designed, not built                                            |

---

## How to Use This File in a New Conversation

Start with:

> "Here is my project tracker — [paste file]. Phases 1–4, Auth, and Alerts (Steps 1–7) are done
> and single-user tested. We're past the initial build and into fixing what multi-user testing
> surfaced — see 'Current Priorities' at the top for the agreed order. I want to work on item
> #N: [name it]."

Then name the specific item from "Current Priorities," e.g.:

- "Let's implement the reliability fix — the GitHub Actions workflow and render.yaml cleanup"
- "Let's go through Supabase's Security Advisor findings"
- "Let's do the codebase orphan/dead-code audit"
- "Let's work on database normalization — I want to actually understand the reasoning, not just get a diff"
- "Let's build the email ingestion pipeline"

**Keep each conversation scoped to one item.** Don't let a session drift into a second workstream
— update this file with what changed/was decided before ending, so the next conversation starts
from accurate ground instead of re-deriving context.
