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
| 3 | **Codebase orphan/dead-code audit** — find unused fields, dead functions, stale logic (e.g. the `is_draft`/`reviewed` confusion, see "Known Gotchas") | ✅ **Done (2026-08-01)** | Full file-by-file pass done, then every finding that was actually #3's own scope was fixed the same day. See **"🔍 Codebase Audit — Findings & Fix Checklist (2026-08-01)"** below. What's *not* fixed was deliberately re-homed, not dropped: schema/column items (`planned_amt`, `auto_detected`, the missing Alembic baseline) move to item #5; stale-docs items move to item #4; `MonthEndReview` nav wiring stays a future alerts-item. |
| 4 | **Docs overhaul** — bring every `.md` file in line with actual repo state | ✅ **Done (2026-08-01)** | `README.md`, `Backend/Requiremnets.md` (superseded banner), `frontend/Design_System.md` fixed and updated. All 8 legacy Finance-tracker docs stamped and status-reconciled, including a full item-by-item re-walk of the 26-issue `financial-logic-audit*.md` series. See **"📚 Item #4 Prep — Legacy Docs Reconciliation (2026-08-01)"** below for the full trail. Two real follow-ups this pass surfaced: variable-income support and the 3-month export cap/no-PDF-report — both added to the roadmap in `README.md`, neither urgent enough for their own numbered item yet |
| 5 | **Database normalization + scalability** | ✅ **Done (2026-08-02)** | Worked collaboratively item-by-item — see **"🗄️ Item #5 — Database Normalization & Scalability (2026-08-02)"** below for the full trail. All 7 sub-items closed: Alembic baseline, `planned_amt`/`auto_detected` drops, FK index cleanup, `entity_sync.py` FK rework, `user_id` NOT NULL, `month_start` wiring, `GET /transactions` pagination. Two real follow-ups surfaced along the way, not fixed yet, added to "Known Bugs" below: the CC-charge debt-reversal gap, and the cashflow chart's month labels still being calendar-only |
| 6 | **Email ingestion pipeline (bank-transaction automation)** | 🔄 Code-complete, not live (2026-08-02) | Schema, poller, and parser (5 real fixtures, all passing) all built. Not yet: commit/push, Render env vars, Cesar's local connection test, forward rule setup — see "Email Ingestion Pipeline" below |

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
| `GMAIL_CLIENT_ID`        | Backend `.env` + Render                     | ⚠️ Set in `.env` (2026-08-02) — **not yet on Render.** See item #6. |
| `GMAIL_CLIENT_SECRET`    | Backend `.env` + Render                     | ⚠️ Set in `.env` (2026-08-02) — **not yet on Render.**        |
| `GMAIL_REFRESH_TOKEN`    | Backend `.env` + Render                     | ⚠️ Set in `.env` (2026-08-02) — **not yet on Render.** Test-user token, doesn't expire on its own. |

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

## 🔍 Codebase Audit — Findings & Fix Checklist (2026-08-01)

Full file-by-file pass, item #3. Backend and frontend, both a sanity/wiring
pass (is everything actually connected the way it looks) and a deep
dead-code pass (unused fields, dead functions, orphaned files). Detailed
reasoning for every item below lives in `AUDIT_FINDINGS.md` in the repo
root if more context is needed — this section is the actionable summary.

**✅ Item #3 closed (2026-08-01).** Everything below that was actually in
#3's own scope (small cleanups, and the two decisions that were #3's to
make) is fixed. Everything that turned out to belong to schema work or docs
work was deliberately re-homed to item #5 / item #4 / a future alerts item
instead of being forced into #3 — see the "Re-homed" subsections below.

### Fix checklist — small, low-risk (✅ fixed 2026-08-01)

- [x] **Renamed Alerts "Dismiss" button label** → "Mark read"
      (`frontend/src/pages/Alerts.jsx`). Behavior was already correct
      (marks read, Tier-2 items need to stay in DB for digest de-dup) —
      only the label was misleading. The separate "✕" delete button
      already worked correctly end-to-end and is untouched.
- [x] **Deleted `Backend/app/services/reconciliation.py`.** Both functions
      were empty `pass` stubs, confirmed zero external references
      (`models.py`/`preferences.py`/a migration filename hit "bank balance
      reconciliation" as an unrelated feature name, not this file — double
      checked before deleting).
- [x] **"The resume" → "Type 2 notification" rename** — checked the actual
      codebase: the nickname was never in real code, only ever used
      conversationally in these tracker docs, which already say "Type 2
      notification" throughout the current text. Nothing left to rename.

### Decisions made & actioned 2026-08-01

- [x] **`earmarked_funds` → shelved (Cesar's call).** Removed the dead
      `client.get("/earmarked/")` call and `earmarkedTotal` state from
      `frontend/src/api/Dshboard.js` — the Free-to-Spend calc no longer
      subtracts it (was always 0 in practice, since no UI ever created an
      earmark, so behavior is unchanged for every real user). Deleted the
      unused `frontend/src/api/earmarked.js` wrapper file. **Backend CRUD
      (`routers/earmarked.py`) left untouched** — it's real, working code,
      just not reachable from any UI right now. Building the actual
      create/edit/delete UI is now its own future feature item, not part
      of closing #3.
- [x] **Tailwind CSS → removed (Cesar's call).** Uninstalled `tailwindcss`
      + `@tailwindcss/vite` from `frontend/package.json`, removed the
      plugin from `vite.config.js`, removed `@import "tailwindcss"` from
      `global.css` and converted the `@theme {}` token block to a plain
      `:root {}` custom-properties block (tokens are consumed via
      `var(--x)` in inline styles throughout the app, not through Tailwind
      utility classes, so this is a no-op for actual visuals). Verified
      with `npm install` (removed 14 packages) + `npm run build` (clean).

### Not part of #3 — stays a future item

- [ ] **Wire `MonthEndReview.jsx` into `App.jsx`'s nav.** This *is* the
      Type 2 notification content — a real, working month-end scorecard
      (score ring, budget category table, bills, debt snapshot,
      auto-generated insights via `buildInsights()`), reading live data
      from existing endpoints. It is simply never imported into
      `NAV_ITEMS_CONFIG`, so no user can ever open it. Confirmed
      2026-08-01 (contradicts this file's older "Type 2 does not exist in
      code at all" note under Phase 5 — corrected below). Remaining real
      gaps once wired in: only has a "Last Month / This Month" toggle
      (no monthly/quarterly/semester cadence), and doesn't fold in fired
      Type 1 alerts (stands alone). Both are open design questions to
      resolve when this gets built out properly. **Deliberately not done
      as part of #3** — it's a build/design task, not an audit fix; pick
      it up when alerts work comes back around (see Phase 5 section below).

### Re-homed to item #5 (database normalization) — not part of closing #3

Both of these are dead-column removals that need a migration. Bundling them
into #5's schema work instead of writing one-off migrations now, ahead of
the missing-baseline-migration fix that #5 already needs as a prerequisite
(see the structural find directly below).

- [ ] **`Transaction.planned_amt` column — dead, no reads or writes
      anywhere in the repo.** Budget-vs-actual tracking is fully handled
      via `BudgetCategory`/`Category.planned_amount` instead. Decide when
      #5 is worked: drop the column, or repurpose for an actual
      per-transaction planned-amount feature if one is wanted.
- [ ] **`Bill.auto_detected` field — write-only, always `False`, never
      read.** Hardcoded in `routers/bills.py` at creation, never set `True`
      anywhere, never checked anywhere. Looks like a stub for the shelved
      banking-API bill-auto-detection idea. Same question as above: keep
      as a placeholder for a future feature, or remove — decide during #5.

### 🔴 Bigger structural find — relevant to item #5, not just item #3

- [ ] **The Alembic migration history is missing its own foundation — 8
      migrations were never committed to git**, including the original
      `create_initial_tables` migration. Nothing in the *tracked* history
      creates `transactions`, `bills`, `debts`, `savings_goals`,
      `categories`, `preferences`, or `budget_categories` — only compiled
      `.pyc` leftovers in a local `__pycache__` folder prove these
      migrations ever existed (`60f07ef1fab8_create_initial_tables`,
      `649adf51abdf_add_categories_table`, `4ff6598f1998_add_preferences_table`,
      `13541706eb86_add_budget_categories`, `68a3f1b7b628_add_category_fk_columns`,
      `aa3ceb629c05_new_changes`, `d2133d11b1b7_bills_add_category_frequency_to_string`,
      `5dadb7844cf9_add_is_draft_and_planned_amount` — all from early
      April, never in `git log --all --full-history`, for any of them).
      The current alembic "root" (`4b9d636e9e03`) has a docstring saying
      it revises `5dadb7844cf9`, but its actual `down_revision` was
      hand-edited to `None` after that file disappeared, so Alembic
      stopped complaining.
      **Practical impact: `alembic upgrade head` cannot rebuild this
      database from an empty Postgres instance today.** This is a real
      disaster-recovery / new-environment gap, and it's why `planned_amt`,
      `auto_detected`, and `is_draft`'s true origin is untraceable — the
      migration that created them was never version-controlled.
      **Recommend: write a proper baseline migration (autogenerate against
      an empty DB reflecting current `models.py`, or a schema-only dump
      from live Supabase) as a prerequisite for item #5's normalization
      work**, not an afterthought once #5 is already underway.

### Confirmed clean / no action needed

- All 14 backend routers registered and reachable; only 3 of ~50 total
  endpoints have no frontend caller, and all 3 have a good reason
  (`earmarked` writes — above; `backfill-payment-method` — a deliberate
  one-shot admin tool per its own docstring, fine as-is; JWKS endpoint —
  meant for external callers, not our frontend).
- `requirements.txt` — no orphaned Plaid/GoCardless/TrueLayer dependencies
  left over from the shelved banking-API path.
- Re-scanned for leaked secrets (per this file's own note to double-check
  during this audit) — clean, only placeholder examples in docs.
- `recurring.py`/`recurring_transactions` (`#22`) — fully built and wired,
  real UI in `Transactions.jsx`. Just undocumented here until now (see docs
  note below).
- Debt table's BNPL/credit-card/amortization fields — all fully wired both
  directions, no orphans.
- `alert_engine.py`, `entity_sync.py`, `payment_utils.py`, `file_parser.py`
  — no dead functions found.
- All frontend context providers, `ImportWizard`, `ExportModal`,
  `OnboardingWizard` — all properly wired. All exported functions in the
  main data-hook files (`Alert.js`, `Transaction.js`, `Dshboard.js`,
  `Debt.js`, `Bill.js`, `Budget.js`, `Saving.js`, `Settings.js`,
  `MonthEndReview.js`) are genuinely consumed — no unused exports.

### Docs-vs-repo gaps (feeds item #4 — flagging now so it isn't lost, not fixing yet)

- `backend/app/categorization.py` and `backend/app/routers/sync.py` —
  referenced in this file as "On hold" — **do not exist in the repo.**
  Either never created or deleted at some point; this file's wording
  should stop implying they're sitting there half-built.
- `alert_engine.py` actually implements **14 check functions**, not the
  "8 rule types" stated under Phase 5 below (bill_due, low_balance,
  debt_overdue, goal_reached, budget_exceeded, spending_spike,
  import_reminder, balance_reminder, goal_behind_pace, periodic_review,
  cc_payment_due, bnpl_installment_due, loan_paid_off,
  min_payment_warning) — all 14 confirmed wired into `evaluate_alerts()`.
- `Backend/Requiremnets.md` (375 lines, note the filename typo) — the
  original day-one project spec (dated 2026-04-01), predates every
  tracked migration, almost certainly superseded by this file now. Needs
  reconciling/retiring during the docs overhaul, not blind deletion.
- Minor comment drift: `alert_engine.py` (lines ~23, ~956) still describes
  `notifications.py` as "stubs / no-ops," which is stale — Step 9 confirmed
  it's fully implemented, not a stub.

---

## 📚 Item #4 Prep — Legacy Docs Reconciliation (2026-08-01)

Before writing the actual docs overhaul, every `.md` file in the separate `Finance-tracker`
folder (not part of this repo — Cesar's own audit-history archive) was read and checked against
the live code. **All files in that folder are legacy** — snapshots of past thinking/audits, not
maintained going forward. Anything in them that's still unresolved gets pulled into this Tracker
as a real item (below); anything already resolved just gets referenced here as legacy backing, the
same way `AUDIT_FINDINGS.md` already works for item #3.

### Legacy docs index (Finance-tracker folder — historical only, not updated going forward)

| File | Covers | Status |
|---|---|---|
| `AUDIT_REPORT.md` | Backend-only audit, April 2026 — 5 bugs, 3 missing features, 3 risks | Mostly resolved — see reconciliation below for the 2 items still open |
| `AUDIT_FINDINGS.md` | Full item #3 codebase audit detail (2026-08-01) | Already the backing doc for item #3 above, current |
| `audit_update.md` | "Safe batch" + "risky batch" fixes, April 28 | Fully superseded — all 10 safe-batch + all 4 risky-batch items confirmed shipped |
| `financial-logic-audit.md` (+ Part 2, Part 3) | 26 conceptual/financial-logic gaps, April 26 | Largely resolved — most map to features built since (recurring, earmarked, month-end review, liquid balance, savings rate fix, onboarding wizard). Not re-walked item-by-item — flagged as a real item #4 subtask below |
| `DEBT_RESTRUCTURE_PLAN.md` | Credit card / loan / BNPL debt restructure design, May | Shipped — migrations `m1_extend_enums_for_debt.py` / `m2_debt_restructure_columns.py` are the last two in `alembic/versions/` |
| `FinanceOS_How_It_Works.md` | Intended product behavior, narrative form | Held up well — reads accurate to current behavior on every section spot-checked. Good base doc for the overhaul rather than a from-scratch rewrite |
| `UI_UX_REDESIGN_PLAN.md` | Dashboard declutter + mobile layout plan, May | Decision recorded below — current dashboard state is the intended final state |

### The bigger finding — three undocumented fix-tracking series live only in code comments

Verifying `AUDIT_REPORT.md`'s bugs against the code turned up numbered fix tags with **no
write-up anywhere** — not in this file, not in any Finance-tracker doc. Cataloged this pass:

**`BUG-01` – `BUG-20`** (backend + frontend, only `BUG-01` – `BUG-05` trace back to
`AUDIT_REPORT.md`'s original five):

| Tag | File | What it fixed |
|---|---|---|
| BUG-01 | `alert_engine.py` | Debt-overdue check reads `type == "debt_payment"`, was `"expense"` |
| BUG-02 | `alert_engine.py` | `budget_exceeded` reads `Category.planned_amount`, not `BudgetCategory`; excludes `cc_charge`, includes `debt_payment` in spend checks |
| BUG-03a/b | `alert_engine.py` | Periodic-review dedup key includes month suffix so the alert re-fires each cycle |
| BUG-04 | `savings.py` | Pre-filled `current_amount` on goal creation now writes a real ledger transaction |
| BUG-05 | `entity_sync.py` | Restoring a payment on a paid-off debt un-marks it paid-off + reactivates its recurring template |
| BUG-06 | `savings.py` | Goal deletion cleans up orphaned hub rows + linked transactions |
| BUG-07 | `savings.py` | `current_amount` removed from the update schema — only changeable via `/contribute` |
| BUG-08 | `budget.py` | `cc_charge` transactions excluded from cash budget actuals |
| BUG-09 | `alert_engine.py` | `cc_charge` excluded from spending-spike calc |
| BUG-10 | `bills.py` | Bill-paid transaction uses the bill's `due_date`, not today's date |
| BUG-11 | `Debt.js` | Delete now triggers a full server refetch instead of local state mutation (kept `creditCards`/`budgetSurplus` stale before) |
| BUG-12 | `recurring.py` | `debt_payment` recurring logs carry `source="debt_payment"` |
| BUG-13 | `Alert.js` | Fixed a stale-closure bug capturing `wasUnread` before state update |
| BUG-14 | `Dshboard.js` | Donut chart tooltip uses the currency-aware formatter, not hardcoded `$` |
| BUG-15 | `Debt.js` / `Saving.js` | Deprecated the hardcoded-`$` formatter helper in favor of `formatAmount` |
| BUG-16 | `Dshboard.js` | Dashboard budget panel merges `debt_payment` categories in, not just expense |
| BUG-17 | `bills.py` | Bill frequency check is now case-insensitive (`"Monthly"` vs `"monthly"`) |
| BUG-18 | `alert_engine.py` | Initialized a variable before conditional branches to avoid `UnboundLocalError` |
| BUG-19 | `summary.py` | Added `is_draft == False` filter to income/expense summary queries (drafts were being counted) |
| BUG-20 | `Saving.js` | Payload builder drops a nonexistent `emoji` field and stops re-sending `current_amount` on edit |

**`ARCH-02` – `ARCH-04`** (no `ARCH-01` found tagged anywhere — worth checking if it ever
existed): `ARCH-02` = CC-charge detection extracted into one shared `apply_cc_charge()` helper
(`payment_utils.py`) used by both `transactions.py` and `bills.py`. `ARCH-03` = positive-amount
validators added consistently across `transactions.py`/`savings.py`/`debts.py`/`bills.py`.
`ARCH-04` = TTL-aware JWKS cache in `dependencies.py` (Supabase rotates keys ~6h; the old
fetch-once-at-startup approach would lock out all users on rotation).

**`FIX #N`** — a *separate*, per-file numbering (not one global sequence) found in `Bill.js`/
`Bills.jsx` (#1–#2, live categories/colors from `SettingsContext`), `Dshboard.js` (#5 budget-row
filtering, #10 parallelized API calls), `Debt.js` (#6 currency-aware simulator slider, #7 verified
avalanche/snowball logic is correct), and a few more not fully cataloged this pass
(`Transactions.jsx`, `Budget.jsx`).

**Recommendation for the actual overhaul:** don't try to write prose docs for all ~30 of these —
most are exactly the kind of micro-fix that belongs in commit messages, not a doc. What's worth
capturing is a short "fix history" pointer (this table, essentially) so nobody re-discovers the
same things by re-auditing from scratch again.

### RISK-01/02/03 (from `AUDIT_REPORT.md`) — re-checked this pass, all three still open

Per Cesar's instruction, every open risk from the legacy audit was re-verified against current
code rather than assumed:

- **RISK-01 — `user_id` nullable on data tables.** Still `nullable=True` on `Transaction`,
  `BudgetCategory`, and most other user-data tables in `models.py`. Folded into item #5 above.
- **RISK-02 — `Preferences.month_start` unused.** ✅ **Fixed 2026-08-02.** `_period_bounds()` in
  `summary.py` now takes `month_start` and computes custom-cycle boundaries instead of hardcoding
  `today.replace(day=1)` — covers the KPI summary (`/summary`) and expense-breakdown donut
  (`/expenses/breakdown`). Verified with a standalone regression test (month_start=1 matches old
  behavior exactly across a range of dates including leap years) plus sanity checks at
  month_start=15 and the month_start=28 Feb edge case. `_month_range()` (cashflow chart month
  labels only) deliberately NOT wired — see "Known Bugs" above.
- **RISK-03 — no pagination on `GET /transactions`.** Confirmed still true — no `limit`/`offset`
  params on the endpoint. Folded into item #5 above (lower urgency than the other two until the
  user base actually grows).

### MISSING-03 — PDF export: not a current requirement

Per Cesar: PDF export (`AUDIT_REPORT.md` MISSING-03, also mentioned in `Backend/Requiremnets.md`
and `README.md`'s roadmap) is **not required for the app to function** right now — it stays a
future nice-to-have, not a tracked bug. Docs overhaul should describe it as roadmap/future, not
as an outstanding gap.

### BUG-03 — transfer type enum mismatch — fixed today (2026-08-01)

`Backend/app/models.py`'s `Transaction.type` SQLAlchemy `Enum(...)` literal was missing
`"transfer"`, even though the live Postgres `transaction_type` enum already had it (added by
migration `k5l6m7n8o9p0_add_transfer_type.py`, April 28) and `transactions.py`'s
`ALLOWED_MANUAL_TYPES` already allowed it. **Fixed:** added `"transfer"` to the enum literal in
`models.py` so the model matches both the DB and the router.

### UI/UX dashboard — decision recorded (2026-08-01)

Per Cesar: the current `Dashboard.jsx`/`Dshboard.js` state (post item #3 audit — no Free to
Spend card, no Net Worth row, no Reserved Funds/Earmarked panel exposed) **is the intended final
state**, not a partial/contradicted version of `UI_UX_REDESIGN_PLAN.md`. That plan doc is
superseded by what actually shipped. Any leftover internal-only computations that no longer feed
a visible UI element (e.g. `Dshboard.js`'s `_netWorthBase`, `freeToSpend`) should be treated as
dead code for a future cleanup pass, not as missing UI to build.

### Docs-overhaul writing pass — done (2026-08-01)

- **`README.md`** — rewritten: Tailwind removed from stack table, "Render Cron" → "GitHub
  Actions," alert-rule list corrected to all 14, Telegram moved from roadmap to confirmed-working,
  recurring transactions / earmarked (built-then-shelved) / month-end review (built-but-unwired) /
  debt restructure (credit card, loan, BNPL, amortization) / Free-to-Spend all added to Features.
  Roadmap rewritten to match `Tracker.md`'s actual current priorities (item #5 normalization,
  email ingestion, PWA push, export cap/PDF, MonthEndReview nav wiring, variable income, live
  bank sync framed as blocked-not-abandoned).
- **`Backend/Requiremnets.md`** — superseded banner added; kept as historical scope record, not
  an active spec.
- **`frontend/Design_System.md`** — Tailwind line fixed, now folded into the tracked docs list.
- **`financial-logic-audit.md` Parts 1–3 (26 items)** — full item-by-item status re-walk done,
  replacing the earlier spot-check. Two real, still-open gaps surfaced that weren't previously on
  any active list: **Issue 16, variable/irregular income support** (nothing built) and **Issue
  26, the 3-month export cap with no PDF/monthly-report format** (unchanged since April). Both
  added to `README.md`'s roadmap. Issue 14 (net worth) is genuinely partial — computed internally,
  never shown to the user, consistent with the 2026-08-01 dashboard-declutter decision.

---

## 🗄️ Item #5 — Database Normalization & Scalability (2026-08-02)

Worked item-by-item, collaboratively, with local verification (a throwaway Postgres instance, not
just autogenerate-and-hope) before anything touched production. All migrations chain off the new
baseline below; each was tested with a real upgrade+downgrade round-trip and a fresh-empty-DB
base-to-head run before being committed.

1. **Alembic baseline migration (prerequisite).** The missing pre-history (8 uncommitted early
   migrations, see item #3's structural find) is confirmed unrecoverable. Replaced the whole broken
   chain with one clean baseline (`966113aa8a57_baseline_current_schema.py`), autogenerated against
   an empty Postgres from current `models.py`. Old 19-file chain moved to
   `Backend/alembic/legacy_pre_baseline/` for reference, no longer active. Along the way found a
   second structural problem the earlier audit missed: **two unmerged Alembic heads** (`f13c72052aba`
   from the alerts work, `m2_debt_restructure_columns` from the debt restructure) — resolved by the
   same baseline replacement. Also found the naive autogenerated file couldn't actually run against
   an empty DB: `transactions` and `budget_categories` have a genuine circular FK (each references
   the other). Fixed mechanically — both constraints added via `ALTER TABLE` after both tables exist,
   current bidirectional design preserved as-is. Production stamped at `966113aa8a57` (not upgraded —
   the live schema already matched).
2. **`Transaction.planned_amt` — dropped.** Confirmed dead (zero reads/writes anywhere).
   Budget-vs-actual is fully handled via `Category.planned_amount` instead.
3. **`Bill.auto_detected` — dropped.** Confirmed write-only (hardcoded `False` at creation, never
   read). Orphaned relative to both the old banking-API plan and the new email-ingestion plan.
4. **Unindexed FK / unused index cleanup.** Added indexes on the 6 FK columns Security Advisor
   flagged (`bills.transaction_id`, `bills.budget_category_id`, `debts.linked_transaction_id`,
   `debts.recurring_transaction_id`, `transactions.budget_category_id`,
   `budget_categories.transaction_id`). Advisor's "unused `ix_*_user_id` indexes" deliberately left
   alone — that's runtime stats (`idx_scan = 0`), not a code check; those indexes are correct for a
   per-user-scoped app and simply haven't been exercised yet at today's low row counts. Dropping them
   would hurt the exact scalability this item is about.
5. **`entity_sync.py` name-based lookups → real FKs.** The old code resolved Bill/Debt/SavingsGoal by
   parsing `BudgetCategory.type` (e.g. `"Debt: Car Loan"`) and matching by name — broke silently on
   rename, picked an arbitrary match on duplicate names. Cardinality turned out to matter: Bills are
   1 hub row per bill (reused across cycles), so `Bill.budget_category_id` already existed as a real
   FK and just wasn't being used — no schema change needed, just fixed the query. Debts and savings
   goals get a NEW hub row per payment/contribution event (many hub rows → one entity), so the FK had
   to go on `BudgetCategory` instead: new `debt_id` / `savings_goal_id` columns. Existing production
   rows backfilled via a one-time migration doing the old name-match, with a safety guard — only
   auto-links when the name is unique per user; genuine duplicates left `NULL` rather than guessed
   (query to find any left over is in the migration's docstring). Tested against synthetic data
   including a deliberate duplicate-name case.
6. **`user_id` NOT NULL (RISK-01).** Applied to the 8 tables where NULL was never a legitimate state
   (`transactions`, `budget_categories`, `bills`, `debts`, `savings_goals`, `preferences`,
   `earmarked_funds`, `recurring_transactions`). **`categories.user_id` deliberately excluded** — NULL
   there means "system category, shared across all users," a real intentional use, not the same gap.
   Migration pre-checks every table for existing NULL rows and raises a clear, specific error naming
   the table and row count if any are found, instead of a generic mid-migration Postgres failure —
   tested both the clean-pass and the fail-with-orphaned-row paths.
7. **`Preferences.month_start` (RISK-02).** Was a fully-built, user-facing feature (working 1–28 day
   picker in Settings, saves and persists) that silently did nothing — `summary.py`'s
   `_period_bounds()` hardcoded calendar months regardless. Now wired in for the KPI summary
   (`/summary`) and expense-breakdown donut (`/expenses/breakdown`). Verified with a standalone
   regression test (`month_start=1` matches the old hardcoded behavior exactly, zero diffs, across
   dates including leap years) plus sanity checks at `month_start=15` and the `month_start=28`
   Feb edge case. `_month_range()` (cashflow chart month labels only) deliberately left
   calendar-only — reworking chart bucket boundaries to a custom cycle is a separate, bigger
   chart-design question. No migration needed — pure application logic.
8. **`GET /transactions` pagination (RISK-03).** Added optional `limit`/`offset` query params.
   Backend-only, additive — default behavior unchanged (still returns everything if unspecified),
   since the frontend doesn't call it with these yet and a real cap without a frontend change to page
   through the rest would have silently hidden older transactions. Also added a secondary sort key
   (`id DESC` after `date DESC`) so pages stay stable when many transactions share a date — verified
   with a seeded dataset with heavy date ties (25 rows, 5 distinct dates): no gaps, no duplicates
   across pages.

**Two real follow-ups surfaced this pass, not fixed, added to "Known Bugs" below:** the
credit-card-charge hub rows that `entity_sync.py` still can't reverse (different bug than #5 above —
those rows never used the name-lookup path at all), and the cashflow chart's month labels still being
calendar-only (deliberately out of scope for #7 above).

**Addendum (2026-08-02, same day) — 5 more constraints recovered.** Answering a follow-up question
about what normal form the schema is in turned up a real gap in the baseline migration itself: a full
sweep of all 9 raw-SQL migrations in the archived `legacy_pre_baseline/` chain against current
`models.py` found 5 real constraints that only ever existed as raw SQL, never declared in the ORM
models — so the autogenerated baseline (item #1 above) silently missed them. All 5 are what actually
enforce real invariants, not cosmetic: `uq_categories_name_system` / `uq_categories_name_user`
(partial unique indexes — one system category per name, one per user per name — the same
duplicate-name integrity problem #5 above already fixed for debts/savings/bills, just not yet caught
here), `alerts_tier_check` / `alerts_severity_check` (CHECK constraints on valid enum-like values),
and `ix_alerts_user_unread` (partial index backing the unread-count query). Fixed properly, not just
patched: declared in `models.py` (`Alert.__table_args__`, `Category.__table_args__`) so they're real
documented schema and future `alembic revision --autogenerate` runs won't see them as drift to drop,
then a migration (`c4201ebc19cc`) to (re)create them, guarded with `IF NOT EXISTS` since production
likely already has them from the old chain having run historically. Verified functionally through the
real ORM insert path (not just "the DDL ran") — confirmed tier=99, severity='bogus', and duplicate
category names are actually rejected, and that two different users can still each have their own
same-named category. Also tested the exact "production already has these" scenario (pre-created the
objects by hand, then ran the new migration on top) — no error, confirmed idempotent.

One more thing surfaced during the same sweep, not a schema gap: an old migration also seeded two
system categories ("Debt Payments", "ATM Withdrawal") via raw `INSERT` — fully superseded today by
`POST /categories/seed` (already includes both), but that endpoint is never mentioned in the
"Deployment Checklist" above. A genuinely fresh environment would come up with zero categories until
someone remembers to call it. Not fixed — added to "Known Bugs" below.

**Second addendum (2026-08-02) — DB ↔ backend ↔ frontend contract check.** Before closing out,
audited every change above for a broken contract between the database, the routers, and the
frontend — not fixing anything new, just confirming nothing already shipped was silently broken.

- **Dropped columns (`planned_amt`, `auto_detected`).** Confirmed clean — zero references anywhere
  in `Backend/` or `frontend/` outside the migration files themselves and historical docs.
- **`user_id` NOT NULL on the 8 tables.** Confirmed clean — every constructor call for the 8 affected
  models across every router (including the less-obvious ones: `earmarked.py`, `recurring.py`,
  `preferences.py`'s auto-create-on-first-GET, `import_router.py`'s bulk CSV path) explicitly passes
  `user_id`. No path was relying on the column being nullable.
- **New CHECK/UNIQUE constraints.** Alerts confirmed clean — `alert_engine.py`'s `_ALERT_META` table
  only ever produces tier∈{1,2,3} and valid severities. Categories — real gap found, see "Known Bugs"
  above (`categories.py` can 500 on a duplicate-name race instead of a clean 4xx).
- **`entity_sync.py` FK rework.** Frontend shape unaffected — `hub_type` in `GET /transactions`'
  response is still derived from `hub.type`'s string prefix exactly as before, nothing reads the new
  `debt_id`/`savings_goal_id` columns directly. Re-confirmed the already-flagged `charge_credit_card`
  gap (its hub row still never gets a `debt_id`, and its `type` isn't a "Debt: " prefix either, so
  `entity_sync.py` never touches it either way) — same known issue, not a new one.

**✅ Item #5 closed (2026-08-02).** Next up: item #6 (email ingestion pipeline).

---

## 🐛 Known Bugs — Backlog (unscheduled)

Found incidentally, not yet triaged into a numbered priority item.

- ~~**Alerts "Dismiss" button doesn't delete the alert"**~~ — **investigated during the item #3
  audit (2026-08-01), not actually a bug.** The button's own tooltip says "Mark as read," and that's
  exactly what it does — intentional, since Tier-2 alerts need to stay in the DB for digest
  de-duplication. The separate "✕" button already deletes correctly end-to-end. Real fix is just a
  label rename ("Acknowledge" or "Mark read") — tracked in the item #3 fix checklist above, not here.
- **Demo mode data is calendar-hardcoded, goes stale over time.** `MockData.js` seeds fixed dates —
  as real time passes those months fall out of any "current month" filtering, so the demo dashboard
  stops showing data even though it's supposed to always look populated. Needs demo data generated
  relative to the current date instead of fixed calendar dates. Not urgent, not tied to current
  priorities — just don't forget it.
- **Deleting a credit-card-charge transaction doesn't restore the CC balance.** Found 2026-08-02
  during the item #5 `entity_sync.py` rework. `charge_credit_card()` in `debts.py` creates its
  `budget_categories` hub row linked to the debt only via `transaction_payment_method = debt.name`
  (a display string, not a real reference) — `type` is set to the expense category (e.g.
  "Groceries"), not a "Debt: " prefix, so `entity_sync.py`'s Bill/Debt/Savings branches never match
  it at all. Reversing/deleting one of these transactions silently does nothing to the debt balance
  it originally increased. Separate bug from the name-based-lookup fix just shipped (that fix only
  covered hub rows created by `record_debt_payment`, which do use the "Debt: " prefix) — this one
  needs its own fix: give `charge_credit_card`'s hub row a real `debt_id` (same column added this
  pass) and teach `entity_sync.py` to reverse a CC-charge-linked debt increase, not just a payment
  decrease. Not fixed yet — flagging so it isn't lost.
- **Cashflow chart's month labels still ignore `month_start`.** Fixed 2026-08-02: `_period_bounds()`
  in `summary.py` (KPI summary + expense-breakdown donut) now respects the user's `month_start`
  preference instead of hardcoding calendar months — see "RISK-02" below. But `_month_range()`, used
  only by `get_cashflow()` to build the chart's month bucket labels (e.g. "Jan/Feb/Mar" for
  `last_3_months`), is still calendar-month-only on purpose — reworking chart bucket boundaries to a
  custom cycle (weekly buckets within a custom-start month, x-axis label alignment) is a bigger,
  separate chart-design question, not a quick fix. Cesar's call (2026-08-02) to leave it for now.
  Not fixed yet — flagging so it isn't lost.
- **Deployment Checklist never mentions `POST /categories/seed`.** Found 2026-08-02 while sweeping
  the legacy migration chain for schema drift (see item #5's addendum above). A fresh environment
  (new Supabase project, disaster recovery) built purely from `alembic upgrade head` would have zero
  categories — nothing calls the seed endpoint automatically. Needs a step added to the "Deployment
  Checklist" section, probably right after Step 6 (run migrations). Not fixed yet — flagging so it
  isn't lost.
- **`categories.py` create/rename can 500 on a duplicate name under a race, instead of a clean 4xx.**
  Found 2026-08-02, closing out item #5 with a full DB↔backend↔frontend contract check (see item #5's
  second addendum below for the full audit). `create_category` and `update_category` (and
  `seed_system_categories`) only do a pre-check `SELECT` before insert/rename — no
  `try/except IntegrityError` around the commit. Normally fine (the pre-check catches it), but two
  concurrent requests creating the same name at once (or a manual create racing the seed endpoint)
  would hit the `uq_categories_name_system`/`uq_categories_name_user` partial unique indexes
  (item #5's addendum above) and surface as an unhandled 500 instead of a clean "name already exists"
  error. Low severity — pre-existing gap (the constraint has been live on production since April, this
  isn't new exposure, just newly documented), not urgent, but a real gap. Not fixed — flagging so it
  isn't lost.
- **`email_ingest.py`'s `parse_bank_email()` only string-matches the sender domain, doesn't
  cryptographically verify it.** Found 2026-08-02 while building item #6's parser; partially
  addressed same day once Cesar confirmed his real notification address
  (`alertasynotificaciones@an.notificacionesbancolombia.com`). Parser now rejects anything not
  from the `notificacionesbancolombia.com` domain before even trying the transaction regexes —
  tested against a `spoofed_sender.txt` fixture (real transaction wording, fake domain) to
  confirm it actually rejects, not just exists unused. **Still not a full fix**: a From: header is
  just text a sending server writes, not cryptographically bound to the real sender — this domain
  check stops casual mistakes, not a deliberate spoof. Proper fix is checking Gmail's own
  `Authentication-Results` header (DKIM/SPF, stamped by Gmail itself on receipt — can't be forged
  by the incoming message). Not implemented because it's still unconfirmed whether Cesar's
  forward rule (being set up now) preserves that header through the forward — Gmail's ARC
  (Authenticated Received Chain) is designed for exactly this relay case and the forward is going
  through Gmail's native Forwarding/Filter mechanism (not a manual "Forward" button, which would
  strip headers), so there's reason to expect it survives — needs confirming once the rule is
  live, not assumed. Not fixed — flagging so it isn't lost.

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

**🔄 In progress — kicked off 2026-08-02.** Decisions made this session:

- **`+alias` token — random per-user token, not the raw `user_id`.** Non-guessable, rotatable
  independently. New `Preferences.ingest_token` column (nullable, unique, generated lazily via
  `POST /preferences/ingest-email` — most users will never opt in, no reason to mint one for
  everybody). Address is `financeos.ingest+<ingest_token>@gmail.com`.
- **First bank to build the real parser against: Bancolombia** (matches the default already in
  `import_router.py`'s CSV importer). `parse_bank_email()` needs one real, redacted sample
  transaction email from Cesar before it can be written for real — blocked until that's shared.
- **Gmail inbox + OAuth: not set up yet.** Manual, one-time setup Cesar has to do himself (account
  creation and Google Cloud OAuth app registration aren't things Claude can do) — checklist below.
  The Gmail poller itself is blocked until `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` /
  `GMAIL_REFRESH_TOKEN` exist.

**Done this session (unblocked, schema-only):**
- [x] `email_import` added to `Transaction.source` enum — migration `648b41c29881`.
- [x] `Preferences.ingest_token` column added — migration `70819a409406`.
- [x] `GET /preferences/` now also returns `ingest_email` (`null` until generated); new
  `POST /preferences/ingest-email` generates it idempotently.
- [x] `google-api-python-client` / `google-auth` added to `Backend/requirements.txt`
  (`google-auth-oauthlib` deliberately NOT added — it's only needed for the one-time local
  refresh-token generation script below, not for the running service).

**Blocked — needs Cesar to do manually before the poller can be built/tested:**
1. Create the Gmail account (e.g. `financeos.ingest@gmail.com` — must match
   `INGEST_LOCAL_PART`/`INGEST_DOMAIN` in `preferences.py` if a different address is used).
2. [console.cloud.google.com](https://console.cloud.google.com) → new project → APIs & Services →
   Library → enable **Gmail API**.
3. APIs & Services → OAuth consent screen → External → fill app name/support email → scope
   `https://www.googleapis.com/auth/gmail.readonly` (read-only is all the poller needs) → add
   `financeos.ingest@gmail.com` as a **test user**. Leave the app in "Testing" status — refresh
   tokens for test users don't expire, and publishing/verification isn't needed for a
   single-inbox personal tool.
4. APIs & Services → Credentials → Create Credentials → OAuth client ID → **Desktop app** → note
   the Client ID and Client Secret.
5. One-time, locally, to mint the refresh token (needs to be run while logged into the
   `financeos.ingest@…` Google account in the browser that pops up):
   ```bash
   pip install google-auth-oauthlib --break-system-packages
   python3 - <<'EOF'
   from google_auth_oauthlib.flow import InstalledAppFlow
   flow = InstalledAppFlow.from_client_config(
       {"installed": {
           "client_id": "YOUR_CLIENT_ID",
           "client_secret": "YOUR_CLIENT_SECRET",
           "auth_uri": "https://accounts.google.com/o/oauth2/auth",
           "token_uri": "https://oauth2.googleapis.com/token",
       }},
       scopes=["https://www.googleapis.com/auth/gmail.readonly"],
   )
   creds = flow.run_local_server(port=0)
   print("GMAIL_REFRESH_TOKEN =", creds.refresh_token)
   EOF
   ```
6. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` — Backend `.env` + Render
   (same pattern as `PLAID_CLIENT_ID`/`PLAID_SECRET` in "Environment Variables" above) + GitHub
   Actions repo secrets (poller rides the same cron mechanism as `BACKEND_URL`/`CRON_SECRET`).

Once those two blockers clear (a sample Bancolombia email, and the three `GMAIL_*` secrets),
`email_ingest.py` (parser + poller) and its GitHub Actions wiring can be built and tested
end-to-end.

**Update (2026-08-02, later same day) — Gmail credentials received, poller built.**

- [x] Cesar completed the Gmail account + Google Cloud OAuth setup and generated a refresh token.
  `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` set in `Backend/.env`
  (gitignored — confirmed, same as every other secret in that file).
- [x] **`Backend/app/email_ingest.py` built** — the poller half (piece #2) is real:
  authenticates to the Gmail API, lists messages not yet tagged with a `FinanceOS/Processed`
  label, resolves each message's `+alias` to a `user_id` via `Preferences.ingest_token`, and
  (once the parser below exists) creates the transaction with `is_draft=False`,
  `source='email_import'`, `reviewed=False` — reuses `import_reminder` and
  `payment_utils.infer_payment_method()` exactly as designed, no new alert mechanism needed.
  Exposed as `POST /email/poll`, protected by the same `CRON_SECRET` header pattern as
  `/scheduler/run`. Registered in `main.py`.
- [x] **`parse_bank_email()` (piece #1) is a deliberate stub, not a guess.** Raises
  `NotImplementedError` rather than inventing Bancolombia parsing logic without a real fixture —
  a wrong guess would silently create incorrect real transactions, worse than not building it
  yet. `poll_inbox()` propagates that error cleanly (doesn't mislabel messages as processed when
  the parser isn't ready) rather than pretending to succeed.
- [x] `.github/workflows/email-poller.yml` added — every 20 min, same `BACKEND_URL`/`CRON_SECRET`
  pattern as `daily-scheduler.yml`. No new GitHub secrets needed — the workflow just hits the
  Render endpoint; Render is what talks to Gmail.
- ⚠️ **Could not test the live Gmail connection from this session** — the sandbox's network
  egress blocks `googleapis.com` (confirmed: `curl https://oauth2.googleapis.com` →
  `403 Forbidden` from the sandbox's own proxy, while `pypi.org` succeeds — a sandbox allowlist
  restriction, not a credentials problem). Gave Cesar a standalone local test script
  (`test_gmail_connection.py`) to run on his own machine, where network isn't restricted.
- **Not yet done:** commit + push the changed files (`models.py`, `main.py`, `preferences.py`,
  `requirements.txt`, both new migrations, `email_ingest.py`, `email-poller.yml`) — left
  uncommitted deliberately for Cesar to review first. Add the three `GMAIL_*` vars to Render
  (same pattern as `PLAID_CLIENT_ID` in "Environment Variables" above, now actually filled in
  instead of on-hold). Then send the redacted Bancolombia sample email so `parse_bank_email()`
  can be written for real.

**Update (2026-08-02, later still) — `parse_bank_email()` written and passing, from 5 real
Bancolombia emails Cesar sent (redacted — his name replaced with a placeholder before committing,
since the GitHub repo is public).**

- [x] Fixtures saved to `Backend/app/email_fixtures/` (QR payment, transfer, card purchase,
  payroll deposit, + one marketing/bill-reminder email that is deliberately NOT a transaction).
- [x] **Real quirk found: Bancolombia uses two different number formats depending on which
  template sent the email.** Card purchases are Colombian-style (`$30.777,69` — period
  thousands, comma decimal); QR/transfer/payroll are US-style (`$14,500.00` — comma thousands,
  period decimal). `_parse_amount()` normalizes both by treating whichever separator appears
  LAST in the string as the decimal point — handles both conventions without hardcoding which
  template uses which.
- [x] The marketing/bill-reminder fixture ("Tenemos novedades" — a registered bill ready to be
  paid, not money that's actually moved) is filtered out by construction: none of the 4 real
  transaction regexes match its wording, so `parse_bank_email()` falls through to `return None`
  for it — no special-casing needed, and the same fallthrough should catch other Bancolombia
  marketing mail that slips through the forward rule.
- [x] `Backend/app/test_email_ingest_parser.py` — standalone fixture regression test (same
  "plain script, not pytest" pattern as the RISK-02 month_start check), all 5 cases pass.
  Runnable via `python -m app.test_email_ingest_parser`.
- ⚠️ **Known gap, not fixed — sender verification.** The parser's `sender` param is accepted but
  not enforced. The 4 regexes require Bancolombia's exact transaction phrasing, which is a real
  (if soft) filter against random mail, but there's no cryptographic check that a message
  claiming "Bancolombia: Compraste..." actually came from Bancolombia — someone who obtained a
  user's `ingest_token` could email fake transactions to their alias. Proper fix is checking
  Gmail's own `Authentication-Results` header (DKIM/SPF, stamped by Gmail itself — can't be
  forged by the incoming message) rather than trusting the From: header text, but it's not yet
  confirmed whether Cesar's eventual forward rule preserves that header through the forward.
  Added to "Known Bugs" below rather than guessed at.
- **Item #6 status: code-complete, not yet live.** Same "not yet done" list as above still
  applies — commit/push, Render env vars, and Cesar's local Gmail connection test — plus now
  actually setting up the forward rule from wherever his Bancolombia notification emails land
  today, to his `financeos.ingest+<token>@gmail.com` alias.

**Forward rule setup checklist (personal Gmail → shared ingestion inbox):**

1. Deploy first (commit/push + Render env vars, above) so `POST /preferences/ingest-email` is live.
2. Get a Supabase JWT from the deployed frontend (log in normally, then either check
   localStorage for the `sb-<project-ref>-auth-token` key, or the Network tab on any API call for
   the `Authorization: Bearer …` header) and use it to call
   `POST /preferences/ingest-email` via the Render backend's `/docs` Swagger UI (Authorize →
   paste the token → try the endpoint). Response is the real
   `financeos.ingest+<token>@gmail.com` address — this is per-user, not the bare shared inbox
   address.
3. In **personal** Gmail (where Bancolombia mail lands today) → Settings (gear) → See all
   settings → **Forwarding and POP/IMAP** tab → Add a forwarding address → paste the address from
   step 2. Gmail sends a confirmation email to it.
4. Log into `financeos.ingest@gmail.com` (the shared inbox), find that confirmation email (it'll
   land there since `+alias` mail is delivered to the base inbox), and confirm it — click the
   link, or copy the code back into the personal Gmail's forwarding settings.
5. Back in personal Gmail → Settings → **Filters and Blocked Addresses** → Create a new filter →
   From: `alertasynotificaciones@an.notificacionesbancolombia.com` → Create filter → check
   **"Forward it to"** → select the now-verified address from step 2 → Create Filter. Leave
   "Skip the Inbox" unchecked so the emails still show up normally too — this is a copy, not a move.

**First live test (2026-08-02) — deployed, forward rule set up, real transfer sent, GitHub Actions
run against it. Two real bugs found:**

- [x] **First run: bare 500, no detail.** Root cause turned out to be a Gmail scope error (below),
  but the actual exception wasn't visible anywhere useful — `trigger_poll()` only caught
  `NotImplementedError`, so anything else escaped to FastAPI's default handler and Render/curl
  just showed generic "Internal Server Error" (21 bytes, no detail). **Fixed:** broad
  `except Exception` added, returns `{type}: {message}` in the response body — GitHub Actions'
  `--fail-with-body` curl now prints the real error directly in the Action log, no more digging
  through Render's log dashboard for every future failure.
- [x] **Real cause, once visible: wrong OAuth scope.** `googleapiclient.errors.HttpError: 403
  ... "Insufficient Permission" ... insufficientPermissions` on `labels.create`. The setup
  checklist above requested `gmail.readonly`, but creating the `FinanceOS/Processed` label and
  tagging messages with it (`_get_or_create_label()`, `_mark_processed()`) are both *writes* —
  readonly never covered them, this was wrong from the start, not a regression.
  **Fixed:** scope changed to `gmail.modify` in `_gmail_service()` (narrowest scope that covers
  read + label management + tagging messages, without granting permanent delete or send).
- ⚠️ **Not yet done: the refresh token in `Backend/.env` (and wherever it's set on Render) is
  STALE** — it was minted under the old `gmail.readonly` scope and can't be silently upgraded.
  Needs regenerating: re-run the same local `InstalledAppFlow` script from the original setup,
  but with the scope updated to `https://www.googleapis.com/auth/gmail.modify`, approve again
  while logged into `financeos.ingest@gmail.com`, then replace `GMAIL_REFRESH_TOKEN` in both
  `Backend/.env` and Render's Environment tab with the new value. Also worth double-checking the
  Google Cloud OAuth consent screen (Step 3 of the original setup) lists `gmail.modify` as an
  available scope, not just `gmail.readonly`.
- **Still unverified:** whether `_resolve_user_id()` actually finds the `+alias` token on a
  real forwarded message. Gmail delivers a filter-forwarded copy to the new envelope recipient,
  but it's not confirmed here whether the message's own `To:` header gets rewritten to that
  address or still shows the original recipient (Cesar's personal address) — if the latter, alias
  resolution would silently fail (`unresolved`, not a crash) even once the scope issue is fixed.
  Worth checking the `unresolved` count specifically on the next real test, not just whether the
  run succeeds.

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

**Known issues deferred to Phase 5 / multi-user testing (historical — both since resolved, see
"Quick Status Summary" and the "Resolved — CSV Import & Savings Mapping" note below):**

- ~~CSV/Excel import not yet implemented (stubs in Settings.js)~~ — shipped, see "CSV / Excel Import" below.
- ~~Banking API auto-categorization for savings transactions — needs design decision~~ — Banking API itself is dead (blocked, decided paused 2026-07-29); CSV side resolved, see below.

---

## ✅ Resolved — CSV Import & Savings Mapping (2026-08-02, was "IMPORTANT FUTURE DECISION")

This used to frame a pending decision covering both CSV import *and* banking API sync. Banking
API is dead — attempted, blocked, formally decided paused 2026-07-29 (see "Banking API Sync —
attempted, blocked, pivoted" below) — nothing in this section applies to it anymore. Stale
reference removed.

The original question (how does a savings-transfer-looking transaction get mapped to a savings
goal on import?) is resolved for CSV by how the importer actually shipped:
`import_router.py`'s `/commit` step restricts `type` to `income`/`expense` only — there's no
`savings` type in the import path. A savings transfer lands as a regular transaction, and the
user reassigns it to a savings goal manually afterward. That's **Option A** below, adopted
implicitly by the build rather than a deliberate conversation. **Option B** (rule-based
auto-categorization) doesn't exist. Fine as current behavior — revisit only if manual
reassignment becomes an actual pain point, not before.

<details><summary>Original two options (kept for context)</summary>

**Option A — Manual mapping after import.** Imported transactions land as regular
expense transactions. The user reassigns any savings-related ones manually.
Simple but requires user intervention.

**Option B — Rule-based auto-categorization.** User defines rules such as
"transactions from account X or with description matching Y → Savings goal Z".
More powerful but more complex to build.

</details>

---

## Phase 5 — Advanced Features 🔄 IN PROGRESS

### Smart Alerts — Steps 1–7 complete ✅

| File                                  | Status  | Notes                                                                                        |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `backend/alembic/versions/a1b2…`      | ✅ Done | Migration: source enum + reviewed + last_seen_at                                             |
| `backend/alembic/versions/b2c3…`      | ✅ Done | Migration: alerts + alert_preferences tables                                                 |
| `backend/app/models.py`               | ✅ Done | Alert + AlertPreferences models added; Transaction.reviewed + Preferences.last_seen_at added |
| `backend/app/alert_engine.py`         | ✅ Done | Actually 14 rule types now, not 8 — see item #3 audit section above; source-aware routing; Tier 1 immediate dispatch stub |
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

**Type 2 notification** (per the 2026-08-01 naming decision — no more "the resume," it just
causes confusion, same lesson as the "digest" naming below). A period-end summary/recap — user
picks the cadence (monthly, quarterly, etc.) — that narratively summarizes how the period went
(spending vs. plan, savings progress, etc.) and may or may not fold in whichever Type 1 items
fired during that window.

**Corrected 2026-08-01 — this was wrong.** The line that used to be here said Type 2 "does not
exist in code at all." It does: `frontend/src/pages/MonthEndReview.jsx` +
`frontend/src/api/MonthEndReview.js` (tagged `#25`) are a complete, working implementation — score
ring, budget category scorecard, bills paid/unpaid, debt snapshot, and a real `buildInsights()`
function generating text insights, all built from live `/summary`, `/budget/categories`,
`/budget/actuals`, `/bills`, `/debts` data (deliberately no new backend needed). **It's just never
wired into `App.jsx`'s nav** — no sidebar link, no route, so no user can ever open it. That's almost
certainly why it was believed to not exist — built in a session that never made it into this file.
See the item #3 audit section above for the fix-checklist entry.

Remaining open design questions, now scoped down to what's actually missing (not a from-scratch
build):
- Cadence: currently only a "Last Month / This Month" toggle — no monthly/quarterly/semester
  selection, no preference field. Confirmed it does NOT reuse `periodic_review_freq` (good — avoids
  the conflation flagged below), but doesn't have any broader cadence concept yet either.
- Whether it should reference Type 1 alerts that fired during the period — currently stands alone,
  generates its own independent insights from raw data instead.
- Format is already resolved in practice: it's a rigid fixed template, not fluid/generated.

**Type 3 — The review reminder.** A nudge to sit down and redo your budgeting (monthly / quarterly
/ semester) so the system's numbers stay accurate. ✅ Built — `periodic_review_freq` on
`AlertPreferences`, evaluated in `_check_periodic_review()`. Known limitation: only supports those
three fixed cadences, no custom period for users with bigger/different budgeting cycles.

**Next steps (not scheduled yet — revisit when alerts come back up as a work item):**
- Wire `MonthEndReview.jsx` into `App.jsx` nav, then design the remaining gaps properly (cadence
  field beyond this/last month; decide whether to fold in Type 1 alerts) — see item #3 audit
  section above, it's mostly built already, not a from-scratch design.
- "Digest" naming rename (e.g. to `tier2_bundle_enabled`) — checked during the item #3 audit
  (2026-08-01), still unchanged/still an open decision, no new information either way.

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
| Codebase orphan/dead-code audit                 | ✅ Done (2026-08-01) — audit + in-scope fixes applied; schema items re-homed to #5, docs items to #4, see section above |
| Docs overhaul                                    | ✅ Done (2026-08-01) — README, Requiremnets.md, Design_System.md updated; all 8 legacy docs reconciled |
| Database normalization + scalability            | ✅ Done (2026-08-02) — 7 sub-items closed, see item #5 section     |
| Email ingestion pipeline                        | 🔄 Code-complete, not live (2026-08-02) — schema, poller, parser all built; needs commit/push, Render env vars, connection test, forward rule |

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
- Item #3 (codebase orphan/dead-code audit) is fully done as of 2026-08-01 — audit + every in-scope
  fix applied. `AUDIT_FINDINGS.md` in the repo root has the full detailed reasoning behind every
  finding if more context is needed.
- Item #4 (docs overhaul) is fully done as of 2026-08-01 — legacy docs reconciled, `README.md` /
  `Backend/Requiremnets.md` / `frontend/Design_System.md` updated.
- Item #5 (database normalization + scalability) is fully done as of 2026-08-02 — see "🗄️ Item #5"
  below for the full trail. Next up is #6 (email ingestion pipeline) — see "Current Priorities" at
  the top.
- "Let's build the email ingestion pipeline"

**Keep each conversation scoped to one item.** Don't let a session drift into a second workstream
— update this file with what changed/was decided before ending, so the next conversation starts
from accurate ground instead of re-deriving context.
