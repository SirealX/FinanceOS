# Financial Logic Audit — Finance Tracker
**Date:** April 26, 2026  
**Prepared for:** Cesar  
**Purpose:** Identify gaps between what the app shows and what actually makes sense for managing personal finances.

---

## Overview

This is not a bug report about code. It's about whether the app's financial model reflects how money actually works in real life. After reviewing the full codebase — the balance calculation logic, the budget system, and the dashboard — there are several places where the numbers are technically correct by the app's rules, but logically misleading or incomplete. Below is each issue explained plainly, followed by what needs to change.

---

## Issue 1 — The Balance Starts From Zero, Not From Your Real Life

### What's happening
The app calculates your "opening balance" by looking at every income and expense transaction entered before this month. If you're new to the app and only started entering data this month, your opening balance is **$0.00** — even if you have $3,000 in your bank account.

This causes the exact problem you described: you show a zero or negative balance while clearly having money and spending it. The app is not saying you have no money — it's saying *it doesn't know* about money that existed before you started tracking.

### Why it's confusing
If your balance shows $0 and you record a $50 expense, the dashboard shows −$50. That looks like you overspent, but in reality you have $2,950 in the bank. The number is honest from the app's perspective, but it's useless to you as a financial tool.

### What's needed
There is already a **Settings field for "Initial Balance" and "Bank Balance"** in the app (visible in the database model). The problem is this information isn't being used prominently or consistently enough. The fix should work like this:

- When you set up the app, you enter what you actually have in your bank account on day one (Initial Balance).
- Every balance calculation from that point forward adds that starting amount.
- The dashboard's balance card should always reflect real money: **Initial Balance + all income − all expenses** since tracking began.

Until that starting number is set and enforced, every balance figure in the app is meaningless.

---

## Issue 2 — "Spending More Than You Earn" Is a Timing Problem, Not a Real Problem

### What's happening
Imagine it's the 10th of the month. You get paid on the 25th. You've already spent $400 on groceries, rent, and transport. The app shows: income $0, expenses $400, net −$400. It looks like a financial crisis.

The app has no concept of **when income is expected**. It only counts income that has already been recorded as a transaction. Mid-month, your income is always behind your spending, so the dashboard almost always makes things look worse than they are.

### Why it's confusing
This is a structural mismatch between reality and what the app shows. A real personal finance tool needs to account for expected, predictable income — especially a regular salary. The question isn't "how much have I earned so far this month?" but "given what I earn and spend each month, am I on track?"

### What's needed
Two things would fix this:

1. **Planned income in the budget** should be visible on the dashboard as context. If your planned income is $2,500 and you've spent $400 so far with $0 received, the app should show "−$400 this month, but $2,500 expected income." Right now, the planned income column exists in the budget but never appears on the dashboard to give context.

2. **A "projected end-of-month" balance** would be far more useful than the current "closing balance." Take opening balance + planned income − planned expenses = what you should have on the 1st of next month.

---

## Issue 3 — The Budget Shows "Over Budget" Even for Things You'll Never Spend

### What's happening
You described this perfectly: you add Transportation to your budget because it's a legitimate expense category, but most months you walk everywhere and spend $0 on it. The app still counts that $80 (or whatever amount) as part of your total planned budget. When your total expenses add up, Transportation pushes the total over your income — and the dashboard shows you as "over budget" even though that money never leaves your pocket.

### Why it's a problem
The budget becomes useless if every line item must be 100% accurate. In real life, budgets have placeholder categories and rough estimates. A tool that screams "over budget" because of a category you never actually use trains you to ignore the warnings — and then you miss a real warning when it matters.

### What's needed
Budget categories need an **"active / skip this month"** toggle. This would work like this:

- Transportation is in your budget template as a category.
- Most months, you mark it inactive (or simply leave its planned amount at $0 for the month).
- The budget totals only count active/non-zero planned categories when calculating whether you're within your income.
- Inactive categories don't disappear — they're there as a reminder to check each month whether you'll need them.

This is different from just setting the amount to $0. A $0 category means "I plan to spend nothing here." What you actually want to say is "I haven't decided if I'll use this category this month" or "I'm intentionally skipping it."

---

## Issue 4 — There Is No Way to Earmark Money for a Known Future Expense

### What's happening
You know you'll need to pay for your studies — maybe next month, maybe in two months. You want to "set aside" that money now so it doesn't appear in your "free money" calculation. But the app has no mechanism for this. Your only options are:

- Add it as a budget expense → inflates total planned expenses → triggers "over budget" even before the month starts.
- Don't add it → the money doesn't look reserved → you might accidentally "spend" it on something else because the dashboard shows it as available.

### Why it matters
This is one of the most important concepts in personal finance: the difference between **money you have** and **money that is actually available to spend freely**. Almost everyone has financial obligations coming up — annual subscriptions, tuition, car insurance, irregular bills — that aren't in this month's budget but shouldn't be treated as free money.

### What's needed
A concept of **"committed funds"** or **"reserved money"**:

- A category (or a separate section) where you can say "I'm reserving $X for [Studies / Annual Insurance / etc.] due in [Month/Date]."
- This reserved amount is subtracted from your "available to spend" number.
- It does NOT count as an expense (you haven't spent it yet) and does NOT count as savings (it's not going to a savings goal — it has a specific destination and date).
- On the dashboard, the free money calculation becomes: **bank balance − active budget commitments − reserved funds = truly free money**.

This is sometimes called "envelope budgeting" in personal finance — every dollar has a job. Right now the app doesn't support this concept at all.

---

## Issue 5 — The Dashboard Never Answers the Most Important Question

### What's happening
Someone using a personal finance app most wants to know: **"How much money can I actually spend freely right now?"** The app currently does not answer this question anywhere. It shows:

- Total income this month
- Total expenses this month
- Net balance (income − expenses − savings for the period)
- Savings rate

But none of these directly answer "how much is left for discretionary spending?" To figure that out, you would have to mentally calculate: bank balance − upcoming bills − reserved funds − remaining budget commitments. The app has all of those pieces but never assembles them.

### What's needed
A **"Free to Spend"** number on the dashboard. The formula would be:

> **Real bank balance − upcoming bills due this month − earmarked/reserved money − remaining committed budget = Free to Spend**

This single number would make the app feel like a real financial assistant rather than a data ledger. If this number is $340, you know you can buy those shoes. If it's $12, you don't.

---

## Issue 6 — Savings Are Counted as "Gone" Money in the Balance

### What's happening
In the current logic, savings transactions are treated the same as expenses when calculating your net balance. `net_balance = income − expenses − savings`. This means that if you save $200 to an emergency fund, your net balance drops by $200 — as if that money was spent.

### Why it's confusing
Savings are not gone. That money is still yours. The difference is that it moved from your checking account to a savings account or goal. When the balance card shows you "−$200 this month" because you saved, it feels like you're losing money when you're actually doing the right thing.

### What's needed
The balance calculation should separate **spending** from **saving**. Your net position should be:

- **Liquid balance:** income − expenses (money remaining in checking/daily use)
- **Total wealth change:** income − expenses + savings added to goals (everything you own, net of what you spent)

Combining these into one number obscures what's happening. Someone who spends $500 and saves $300 has a very different financial situation from someone who spends $800 and saves nothing — but the current "net balance" treats them the same way.

---

## Issue 7 — The Savings Rate Formula Doesn't Include Savings Transactions

### What's happening
The savings rate is calculated as: `(income − expenses) / income × 100`. This formula ignores any transactions tagged as type "savings." So if you earn $1,000, spend $800, and log $200 as a savings contribution, your savings rate shows **20%** — which appears to count the savings. But actually it's measuring "unspent income" not "intentionally saved money."

If you earn $1,000, spend $600, and save $400, your savings rate shows **40%** — even if $400 of that was an emergency repair you haven't paid yet and you have no actual savings goal contributions.

### Why it matters
This makes the savings rate feel arbitrary. It's measuring "did you have money left over?" rather than "are you actively building savings?" For the metric to be meaningful, it should track: **(savings transactions + unspent surplus) / income**.

---

## Summary — What Needs to Be Built

| Problem | Concept Missing from the App |
|---|---|
| Zero balance when you have money | Initial balance / tracking start date must be enforced on setup |
| Looks like overspending mid-month | Planned income context on the dashboard |
| Budget shows over-limit from unused categories | Active/inactive toggle per budget category per month |
| Can't reserve money for a known future expense | "Committed funds" or envelope-style earmarking |
| No answer to "how much can I spend?" | "Free to Spend" number on dashboard |
| Saving money looks like losing money | Separate liquid balance from total wealth change |
| Savings rate doesn't reflect actual saving behavior | Fix savings rate formula to include savings-type transactions |

---

## Priority Order

If these were fixed in order of impact on day-to-day usefulness:

1. **Issue 1** — Fix the initial balance problem. Nothing else makes sense until the balance numbers are real.
2. **Issue 5** — Add a "Free to Spend" calculation. This is the core purpose of the app.
3. **Issue 4** — Add earmarked/committed funds. This is what makes "Free to Spend" trustworthy.
4. **Issue 3** — Add active/inactive toggle for budget categories.
5. **Issue 2** — Add expected income context on the dashboard.
6. **Issue 6** — Separate spending balance from wealth change.
7. **Issue 7** — Fix the savings rate formula.

---

*End of audit. These are conceptual and UX-level issues — all are solvable without rebuilding the app, but several require new fields in the database and new UI components.*
