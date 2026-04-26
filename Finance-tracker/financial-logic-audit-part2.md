# Financial Logic Audit — Part 2: What the App Is Missing
**Date:** April 26, 2026  
**Prepared for:** Cesar  
**Purpose:** Beyond the calculation errors in Part 1, these are features and concepts that are completely absent from the app — things a personal finance tool needs to actually help someone manage their money.

---

## Issue 8 — Bills Reset to "Unpaid" Only If You Do It Manually

### What's happening
The Bills page stores every bill with a frequency — monthly, annual, etc. But there is **no code anywhere that automatically resets a paid bill to unpaid** when the next billing cycle starts. If you pay rent on April 1st and mark it paid, on May 1st it still shows as paid. Nothing changes unless you manually go in and flip it back to unpaid.

### Why this destroys the feature
After the first month, your Bills list becomes a historical record of what you paid, not a live view of what you owe. The whole point of a bills tracker is to know what's coming up. Within two or three months, everyone stops looking at the bills page because it's always showing everything as paid.

### What's needed
When a bill's due date passes and its frequency is monthly, the app should automatically roll the due date forward by one month and reset status to "unpaid." For annual bills, forward by one year. This should happen in the backend — either on a nightly scheduler job or when the bills page is opened. Without this, the Bills feature only works for the first billing cycle.

---

## Issue 9 — The Dashboard Has No Idea Your Bills Exist

### What's happening
The main dashboard — the one you check every day — **never reads from the bills table at all**. The summary endpoint only looks at transactions. Unpaid bills are completely invisible to the dashboard.

### Why this is a problem
Imagine it's the 20th of the month. You have $800 in your account. The dashboard shows your balance as $800. But you have rent ($600) and electricity ($80) due in 5 days. Your real "safe to spend" amount is $120, not $800. The app has no way to tell you this because bills and balance live in completely separate worlds that never talk to each other.

### What's needed
The dashboard should fetch unpaid bills for the current month and show them as "committed outgoing" — money you have but can't freely spend. This connects directly to the "Free to Spend" concept from Part 1. The formula becomes:

> **Bank balance − unpaid bills this month − reserved funds = Free to Spend**

Even a simple panel that says "You have $680 in unpaid bills this month" would be a massive improvement.

---

## Issue 10 — Savings Goals Never Tell You If You're On Track

### What's happening
A savings goal in the app shows: goal name, target amount, current amount, a progress bar, and a deadline date. That is all.

What is completely missing is any calculation that answers the questions a person actually asks when saving money:

- "How much do I need to save each month to hit this by the deadline?"
- "At the rate I'm currently contributing, when will I actually reach this goal?"
- "Am I ahead or behind where I should be right now?"

### An example of the problem
You want to save $1,200 for a vacation by December. It's April. You have $200 saved. The app shows 16% complete with "Dec 2026" as the deadline. It does not tell you:

- You need to save **$125/month** for the next 8 months to make it.
- Based on your recent contributions of $50/month, you'll reach it in **20 months** — which is **April 2028**, not December 2026.
- You are **behind by $350** versus where you should be right now if you started from January.

Without these numbers, a savings goal is just a static target. It doesn't help you plan or course-correct.

### What's needed
Every savings goal card should display:
- **Monthly amount needed** (remaining ÷ months until deadline)
- **Current pace** (average monthly contribution based on history)
- **On track / behind / ahead** status based on comparing pace vs needed
- **Projected completion date** if you continue at your current pace

---

## Issue 11 — Debt Minimum Payments Are Not in Your Budget

### What's happening
The Debts page shows a "Total Monthly Minimums" number — the sum of all your minimum payments across every debt. But this number exists only on the Debts page. It never appears in the budget, never affects your "free money" calculation, and never shows up on the dashboard.

### Why this is dangerous
If you owe $400/month in minimum debt payments but your budget doesn't include this, your budget plan is wrong from the start. You think you have $400 more available than you actually do. The budget will always tell you that you have money to spare, and you'll consistently overspend or fall behind on debt payments without understanding why.

### What's needed
Debt minimum payments should automatically appear as committed expenses in the budget — either as a dedicated "Debt Payments" budget category that updates when debts change, or as a separate line item under committed expenses. The user should not have to manually add a budget line for debt minimums; the app already knows exactly what they are.

---

## Issue 12 — Annual Bills Have No Monthly Planning Support

### What's happening
The Bills section allows setting frequency as "annual." But when an annual bill comes up — say, a $360 yearly software subscription — the app treats it as a one-month expense of $360. There is no concept of setting aside $30/month throughout the year so you're not surprised when the charge hits.

### Why this matters
Annual bills are one of the most common causes of "I have no idea why my account is low this month" moments. Insurance, subscriptions, registrations, annual memberships — they all come as a big hit once a year. The only way to not be surprised is to plan for them monthly.

### What's needed
Annual (and quarterly) bills should have a **monthly provision amount** — essentially telling you "set aside $X every month for this." This provision amount should appear in the budget as a regular monthly expense, even though the actual charge only hits once a year. When the bill is paid, the accumulated provision covers it and no budget spike appears.

This is a well-established personal finance concept called "sinking funds."

---

## Issue 13 — The Debt Simulator Is Disconnected From Your Actual Money

### What's happening
The debt payoff simulator lets you drag a slider to add an "extra payment" — for example, $200/month extra on top of minimums. It then shows you how many months faster you'll be debt-free and how much interest you'll save.

The problem: **the simulator has no idea whether you actually have $200 extra per month.** It doesn't look at your budget, your income, or your expenses. You could set the extra payment to $2,000 and the chart would happily show you as debt-free in 3 months, even if your total monthly income is $1,800.

### Why this is misleading
A person using this feature might build a plan around "I'll pay $300 extra per month" without realizing they can only afford $50 based on their real budget. The simulation becomes a fantasy rather than a plan.

### What's needed
The simulator should show context alongside the slider: "Your budget shows approximately $X available after expenses and bills. That's your realistic maximum extra payment." The slider should have a marker indicating the "affordable" amount, while still allowing the user to explore what would happen if they cut spending elsewhere to free up more for debt payoff.

---

## Issue 14 — Net Worth Is Never Calculated

### What's happening
The app separately tracks:
- Your bank balance (in Settings)
- Your savings goal amounts (in Savings)
- Your debt balances (in Debts)

But it never puts these together. **Net worth — total assets minus total debts — is never calculated anywhere in the app.**

### Why this matters
Net worth is the single most important number in personal finance. Your monthly cash flow tells you how you're doing this month. Your net worth tells you how you're doing in life. Someone who earns well but has massive debt has a negative net worth. Someone who earns modestly but has been saving for years might have substantial positive net worth.

Without this number, the app only shows you a slice of your financial picture. You have no way to see whether your overall financial position is improving or worsening over time.

### What's needed
A net worth calculation: **(bank balance + sum of savings goal amounts) − total debt balances = Net Worth**

This should appear on the dashboard, and ideally be tracked month-over-month so you can see the trend. Even a simple positive/negative indicator would make the app significantly more useful as a financial health tool.

---

## Issue 15 — There Is No Way to Record a Transfer Between Accounts

### What's happening
The app only supports three transaction types: income, expense, and savings. There is no "transfer" type. If you move $500 from your checking account to a savings account, the only way to record this in the app is to log it as an expense (which makes your balance drop) and separately log a savings contribution. This creates double-counting issues and makes the balance look wrong.

This also applies to paying a credit card balance from your checking account — that is a transfer, not an expense.

### Why this matters
Without a transfer type, any movement of money between your own accounts creates fictional income or expense figures. It corrupts your spending data, inflates your expense totals, and makes it impossible to track accurate balances across accounts.

### What's needed
A "Transfer" transaction type that moves money between tracked accounts without counting as income or expense. The sending account balance goes down; the receiving account balance goes up; net worth and total expenses are unaffected.

---

## Issue 16 — Variable Income Has No Support

### What's happening
The budget system assumes you earn a predictable fixed amount every month — you set a "planned income" amount and that's it. If your income changes month to month (freelance work, tips, commissions, seasonal work, side projects), there is no way to handle this. You either:

- Set your income to the minimum you might earn (making every good month look confusingly flush), or
- Set it to your average (making bad months look like failures), or
- Update it manually every month before the month starts.

### Why this matters
Variable income earners are exactly the people who most need a strong budgeting tool — their cash flow is unpredictable and they can't rely on a steady paycheck as a safety net. But the current app is built entirely around a fixed monthly income model.

### What's needed
At minimum: the ability to separate **guaranteed income** (fixed salary) from **variable income** (freelance, commissions) in the budget, and show the budget plan based on the guaranteed floor. If variable income comes in on top of that, it's treated as a surplus to be allocated. This way, someone with variable income can build a budget that works even in their worst month.

---

## Summary Table

| Issue | What's Missing | Impact |
|---|---|---|
| 8 | Bills never auto-reset to unpaid next month | Bills feature breaks after first month |
| 9 | Dashboard ignores unpaid bills entirely | Balance looks higher than it really is |
| 10 | Savings goals don't show monthly needed or on-track status | Goals are passive, not actionable |
| 11 | Debt minimums don't appear in budget | Budget always overestimates available money |
| 12 | Annual bills have no monthly provision (sinking funds) | Annual charges appear as surprise expenses |
| 13 | Debt simulator ignores your actual budget capacity | Payoff plans are disconnected from reality |
| 14 | Net worth is never calculated | No view of overall financial health |
| 15 | No transfer transaction type | Moving money corrupts expense/balance data |
| 16 | No support for variable/irregular income | Freelancers and variable earners can't use the budget properly |

---

## Combined Priority List (Part 1 + Part 2)

Reading both reports together, here is the order that would make the most difference to a real user:

1. Fix the initial balance / starting point (Part 1, Issue 1) — nothing else is trustworthy without this
2. Bills auto-reset and connect to the dashboard (Part 2, Issues 8 & 9) — makes the bills feature actually work
3. Free to Spend number on the dashboard (Part 1, Issue 5) — the core question the app should answer
4. Savings goals: monthly needed + on-track status (Part 2, Issue 10) — turns passive goals into plans
5. Debt minimums auto-appear in budget (Part 2, Issue 11) — prevents a systematic blind spot
6. Earmarked / committed funds (Part 1, Issue 4) — makes Free to Spend trustworthy
7. Net worth calculation (Part 2, Issue 14) — adds a long-term financial health view
8. Budget category active/inactive toggle (Part 1, Issue 3) — fixes the "always over budget" problem
9. Annual bill sinking funds (Part 2, Issue 12) — removes surprise annual charges
10. Transfer transaction type (Part 2, Issue 15) — prevents corrupted data
11. Debt simulator shows affordable range (Part 2, Issue 13) — makes simulations realistic
12. Variable income support (Part 2, Issue 16) — opens the app to a wider set of users
13. Planned income context on dashboard (Part 1, Issue 2) — helps mid-month picture
14. Separate spending balance from wealth change (Part 1, Issue 6) — clarity on what "balance" means
15. Fix savings rate formula (Part 1, Issue 7) — makes the metric meaningful

---

*Together, Part 1 and Part 2 cover 15 distinct gaps. The first 7 on the priority list above are the ones that, if fixed, would transform this from a data entry tool into an app that genuinely helps someone control their money.*
