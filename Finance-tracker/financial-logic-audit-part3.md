# Financial Logic Audit — Part 3: Usability & "Replace Your Accountant" Gaps
**Date:** April 26, 2026  
**Prepared for:** Cesar  
**Purpose:** What's missing for this app to be the only financial tool a person needs — not just a data recorder, but something that actively helps them understand and manage their money.

---

## The Core Problem: The App Records. It Doesn't Help.

An accountant doesn't just write down numbers. They look at your full picture, connect the dots between different areas of your finances, flag what's off, and tell you what to do about it. Right now, this app does the first part — recording — but almost none of the second part. Each page is an island. The dashboard doesn't know about your bills. The budget doesn't know about your debt minimums. The savings goals don't affect the budget. You still have to open every section, read the numbers, and do all the mental work yourself. That's what Parts 1 and 2 were about at the calculation level. This part is about the experience level.

---

## Issue 17 — There Is No Onboarding. New Users Land on an Empty Dashboard With No Direction.

### What's happening
When someone creates an account, they see one modal that asks for their name, and then they land on the dashboard. Every number shows $0.00. Every chart is empty. There is no guidance, no checklist, no suggested next step. Nothing tells them:

- "Set your starting bank balance so your numbers are real."
- "Add your monthly income to the budget so the app knows what you earn."
- "Enter your regular bills so the app knows what you owe."
- "Add your existing debts so we can help you plan a payoff strategy."

A person who is not already comfortable with personal finance tools will look at this empty screen and not know where to start. Most will add a few transactions, see that the dashboard still looks confusing, and stop using the app within a week.

### Why this kills the product
The hardest problem in personal finance apps is not building the features — it's getting people to set up correctly and stick with it. If the first 10 minutes are confusing, they're gone. An accountant's first meeting with a client isn't "here's a blank spreadsheet, fill it in." It's "let me ask you some questions and we'll build your picture together."

### What's needed
A one-time setup wizard — 5 to 6 steps — that runs on first login:
1. What's in your bank account right now? (sets initial balance)
2. What do you earn each month, and when? (seeds budget income)
3. What are your regular monthly bills? (seeds bills)
4. Do you have any debts? (seeds debts with balances and rates)
5. Is there anything you're saving toward? (seeds savings goals)
6. Set your monthly budget for key expense categories.

After completing this, the dashboard shows real numbers and the app is immediately useful. This single change would do more for user retention than any other feature.

---

## Issue 18 — You Cannot Search Your Transactions

### What's happening
The transactions page has three filters: type (income/expense/savings), time period (this month, last month, last 3 months), and category. There is **no text search**. You cannot type "Netflix" and find every Netflix charge. You cannot type "pharmacy" and see all your health expenses. You cannot search by amount.

### Why this matters every single day
"When did I last pay that dentist bill?" "How much have I spent at that restaurant this year?" "I see a $43 charge I don't recognize — what is it?" These are the questions people ask when managing their own finances, and none of them can be answered without a text search. Without it, your transaction history is a list you scroll through manually. With hundreds of transactions over a few months, that becomes unusable.

### What's needed
A simple text input on the transactions page that filters by description (and ideally by category name too) in real time as you type. No backend changes needed — this can be done entirely on the frontend by filtering the already-loaded transaction list.

---

## Issue 19 — The Budget Never Shows Whether Your Plan Actually Adds Up

### What's happening
The Budget page has three cards at the top: Expenses (actual vs planned), Income (actual vs planned), and Savings (actual vs planned). These three cards show each category in isolation.

What the budget page never shows is the bottom line: **does your planned spending fit within your planned income?**

If you plan to earn $2,500, plan to spend $2,800 on expenses, and plan to save $300, your budget is over by $600. The app shows you three cards with individual progress but never assembles them into "your plan is $600 over your income" or "your plan leaves you $100 short every month." You have to do that math yourself.

### This is the most fundamental purpose of a budget
A budget is a plan for where your money goes. The most important question a budget answers is: "Is this plan sustainable given what I earn?" The app currently does not answer this question anywhere.

### What's needed
A single summary row at the top of the Budget page: **Planned Income − Planned Expenses − Planned Savings = Planned Surplus or Deficit.** If it's positive, you have a realistic plan. If it's negative, your plan doesn't work and you need to adjust before the month starts. This should be front and center, not something you calculate in your head.

---

## Issue 20 — Paying a Bill Creates a "Draft" Transaction That You Then Have to Review

### What's happening
When you mark a bill as paid, the app automatically creates a transaction record — which is correct and useful. But the transaction is created with `is_draft = True`. This means it immediately appears in the "drafts to review" count shown in the navigation badge. The user now has to go to Transactions, find the draft, and confirm it.

### Why this is backwards
The user just told the app "I paid this bill." That is an explicit, deliberate action. Creating a draft transaction from that action and then asking the user to confirm it is the equivalent of someone sending you an email saying "I'm coming to your party" and you replying "please confirm you're coming to my party." You already know.

Draft transactions exist for imported or auto-synced entries where the user needs to verify the details. A bill payment is the opposite — it's the user's own explicit input. It should create a confirmed transaction immediately.

### What's needed
Bill payment transactions should be created with `is_draft = False`. Confirmed. Done. The user already provided all the information by setting up the bill and clicking "mark as paid."

---

## Issue 21 — Debt Due Dates Are Not Tracked, So Alerts Fire At the Wrong Time

### What's happening
The Debt model in the database has: name, balance, original balance, interest rate, minimum payment, and priority rank. There is **no due date field**. Because of this, the "debt payment overdue" alert works like this: on the 28th of every month, check if any debt has no recorded payment this month. If yes, fire an alert.

This creates two real problems. First, if your credit card payment is due on the 15th, you will not get any warning until the 28th — two weeks late. Second, the alert is better than nothing, but a good finance tool should remind you *before* something is due, not after.

### The practical impact
Missing a debt payment has real consequences: late fees, penalty interest rates, credit score damage. This is exactly the kind of thing a personal finance app should protect you from. The current implementation can only tell you after the fact that you might have missed it — and even then only on the 28th.

### What's needed
Add a `due_day` field to the Debt model (day of month the payment is due, e.g. 15 for the 15th). The alert system should then fire a "payment due soon" warning 5–7 days before the due day, just like it does for bills. This is a one-column database change with a significant real-world impact.

---

## Issue 22 — There Are No Recurring Transactions

### What's happening
If you buy groceries every week at the same store, or get paid every two weeks, or have a gym membership auto-charged every month, you have to enter each one manually or import it from a bank statement. There is no way to create a recurring transaction template that generates entries automatically or reminds you to log them.

### Why this causes people to abandon manual tracking
The number one reason people stop using expense trackers is data entry fatigue. When every transaction requires opening the app, filling out a form, and submitting, it becomes a job. After a few weeks, people stop because the effort outweighs the benefit.

Bills partially solve this for fixed monthly expenses — but only if they're paid with a card that creates a transaction. Regular income (salary), variable recurring expenses (weekly groceries, monthly haircut), and cash transactions all still require manual entry every single time.

### What's needed
A "recurring transaction" template: define a description, amount (or approximate amount), category, type, and frequency. The app either auto-creates the transaction on schedule or sends a reminder notification: "Your weekly grocery run is usually around this time — did you shop this week?" Users can quickly confirm and adjust the amount, turning a 3-minute data entry task into a 10-second confirmation.

---

## Issue 23 — The App Never Explains What the Numbers Mean or What to Do About Them

### What's happening
Every page shows numbers, percentages, and charts. None of them are interpreted. If your savings rate is 8%, is that good or bad? If your food spending is 34% of your budget, should you be concerned? If your debt payoff timeline is 4 years with avalanche versus 4.5 years with snowball, what does that actually mean in real money?

An accountant doesn't just hand you a spreadsheet. They say: "Your savings rate is low — most financial advisors recommend 20%. Here's where the money is going instead." The app has all this data but never speaks.

### The most common missing interpretations
- Savings rate benchmark context ("most advisors suggest 15–20% as a minimum")
- Budget category percentage of income ("your rent is 41% of your income — above the commonly recommended 30%")
- Debt-to-income ratio on the debts page
- Whether savings goals are realistically achievable by their deadlines
- Whether spending in a category is trending up month over month

### What's needed
Contextual explanations next to key metrics. Not lectures — just a single sentence that tells the user whether their number is normal, good, or concerning. Something as simple as a tooltip or a subtitle under a KPI card: "8.0% — most people aim for 15–20%." This turns data into guidance, which is what an accountant does.

---

## Issue 24 — Each Section of the App Is Completely Isolated From the Others

### What's happening
This is the most structural problem in the entire app. Every page works independently:

- The **dashboard** doesn't know you have unpaid bills.
- The **budget** doesn't know your debt minimums.
- The **savings goals** don't affect the budget or the free money calculation.
- The **debt simulator** doesn't know your budget capacity.
- The **alerts** don't know whether a bill spike is from an annual charge or new spending.

To get a complete picture of your finances, you have to open every page, read the numbers, and mentally connect them. That is exactly the job you are trying to eliminate by using this app.

### What a connected version looks like
The dashboard should be the place where everything comes together:

- Balance = bank balance (real), minus unpaid bills due this month, minus earmarked funds
- Budget summary: how you're tracking vs your plan, in one number
- Savings: whether you're on track for each goal
- Debt: total owed, minimum this month, when the next payment is due
- Free to spend: the single number that tells you what you can actually use

Right now the dashboard shows income, expenses, savings rate, and a balance — all of which are calculated in isolation and don't reflect the full picture.

---

## Issue 25 — There Is No Month-End Review

### What's happening
At the end of each month, the app just resets. A new month starts, you're looking at $0 income and $0 expenses again, and whatever happened last month is now a filtered view you have to deliberately navigate to. There is no moment where the app says: "Here's how April went. Here's what was different from your plan. Here's what to watch in May."

### Why this matters
Improving your finances is a habit built through regular reflection. Without a prompt to review, most people never look back at last month's data. They just start tracking again without ever learning from what happened. An accountant sends you a monthly summary. They review what you budgeted vs what you spent. They suggest adjustments for next month. The app has all the data to do this but it never does.

### What's needed
A "Monthly Review" screen that appears (or can be accessed) at the start of a new month, showing:
- Last month's income vs budget plan
- Last month's expenses by category, highlighting what was over or under
- Net change in savings goals
- Net change in debt balances
- One or two suggested adjustments for this month ("Your entertainment spending was 40% over budget in April — consider reducing it for May")

This does not need to be complex. Even a simple read-only summary of last month with a "how did I do?" framing would create the review habit that makes financial management actually work.

---

## Issue 26 — Export Is Capped at 3 Months and Has No Monthly Report Format

### What's happening
The export function allows downloading transactions as CSV or XML for a maximum date range of 3 months. The Settings page mentions "PDF monthly reports are coming in a future update." There is currently no way to get:

- A full-year transaction export
- A formatted monthly statement (like a bank statement, but for your own data)
- A summary report showing income, expenses by category, and net for any given month

### Why this matters for being your own accountant
One of the core reasons people use an accountant is to get a clear picture of their finances for the year — to see the full story, do their own planning, and share numbers with other people (landlords, loan applications, financial advisors). If you can't export a full year's data in a usable format, the app becomes a tool you use in the moment but can't rely on for longer-term financial decisions.

### What's needed
At minimum: remove the 3-month export limit (or raise it significantly). The monthly PDF report that's already planned should be prioritized. The ideal would be: a one-click "monthly statement" that looks like a real financial summary — income received, expenses by category, savings contributions, net change — formatted well enough to share or file.

---

## Summary: The Gap Between "Data Recorder" and "Financial Tool"

The difference between an app you fill in and an app that actually helps you is whether the app connects the dots and tells you what to do. Here's the full list of what's missing:

| Issue | What's Absent | Why It Matters |
|---|---|---|
| 17 | No setup/onboarding wizard | Most people set up wrong and quit within a week |
| 18 | No text search on transactions | Can't find anything once you have real history |
| 19 | Budget never shows planned surplus/deficit | The most important output of a budget is missing |
| 20 | Bill payments create drafts requiring review | Paying a bill creates busywork instead of being final |
| 21 | Debt has no due date — alert fires on the 28th | Debt alerts are always too late |
| 22 | No recurring transactions | Data entry fatigue kills the tracking habit |
| 23 | Numbers are never interpreted or explained | Data without context is not guidance |
| 24 | Every page is isolated — no cross-section picture | You still do all the mental work yourself |
| 25 | No month-end review or reflection prompt | No learning loop — same mistakes repeat |
| 26 | Export capped at 3 months, no monthly report | Can't use the app for longer-term planning |

---

## What "Replace an Accountant" Actually Requires

Across all three parts of this audit, the app has 26 identified gaps. But they all point to the same root problem: **the app is built as a tracker, not as a financial advisor.**

A tracker records what happened. An advisor looks at what happened, compares it to the plan, tells you what it means, connects the different pieces of your financial life, and tells you what to do differently.

The features that would cross that line — in rough order of impact — are:

1. Onboarding wizard that sets everything up correctly from day one (Issue 17)
2. Dashboard that shows the full picture: balance, bills due, debt due, free to spend (Issues 1, 9, 24)
3. Budget that shows whether the plan adds up (Issue 19)
4. Numbers with context — "is this good?" answered for the user (Issue 23)
5. Monthly review / end-of-month summary (Issue 25)
6. Savings goals with "on track?" and "monthly needed" (Issue 10)
7. Recurring transactions (Issue 22)
8. Net worth calculation (Issue 14)
9. Text search on transactions (Issue 18)
10. Debt due dates and properly-timed payment reminders (Issue 21)

Building those 10 things, on top of fixing the calculation errors in Parts 1 and 2, would produce an app that genuinely does what an accountant does for everyday money management — without the hourly rate.

---

*This is Part 3 of the Financial Logic Audit. Read together, Parts 1, 2, and 3 cover 26 gaps across calculation correctness, missing financial concepts, and user experience. The combined priority list is at the bottom of Part 2.*
