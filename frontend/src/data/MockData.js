/**
 * FinanceOS — Mock / Demo Data
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all seed data used across the application.
 *
 * PURPOSE
 *   • Keeps personal information out of component files and version control.
 *   • Makes it trivial to swap demo data for real API data later — each view
 *     imports from here; swapping one import is all that changes.
 *   • Allows a "demo mode" build to ship with safe, generic sample data while
 *     authenticated users see their own data fetched from the backend.
 *
 * CONVENTIONS
 *   • All amounts are in USD.
 *   • "Today" for demo purposes is fixed at 2026-04-04 so due-date logic,
 *     delta labels, and period filters all behave consistently.
 *   • No real names, phone numbers, email addresses, or account numbers appear
 *     anywhere in this file.
 *   • IDs are simple strings; the backend will use UUIDs.
 *
 * REPLACING WITH REAL DATA
 *   When the FastAPI backend is wired up, replace the relevant export with an
 *   async fetch call and re-export the response shape. Components that already
 *   destructure these exports will continue to work without changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0.  SHARED CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed "today" for demo mode. Replace with `new Date()` in production. */
export const DEMO_TODAY = "2026-04-04";

/** Display name shown in the sidebar and dashboard greeting. */
export const DEMO_USER = {
  initials: "DU",
  name: "Demo User",
  role: "Personal",
};

// ─────────────────────────────────────────────────────────────────────────────
// 1.  CATEGORY CONFIGURATION
//     Shared by Transactions, Budget, Settings, and chart legends.
//     Order matches DESIGN_SYSTEM.md §2 — do not reorder.
// ─────────────────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORY_CONFIG = {
  "Housing / Rent": { color: "#6366F1", bg: "rgba(99,102,241,0.13)" },
  "Food & Dining": { color: "#10B981", bg: "rgba(16,185,129,0.13)" },
  Transport: { color: "#F97316", bg: "rgba(249,115,22,0.13)" },
  Shopping: { color: "#38BDF8", bg: "rgba(56,189,248,0.13)" },
  Health: { color: "#A78BFA", bg: "rgba(167,139,250,0.13)" },
  Entertainment: { color: "#F97316", bg: "rgba(249,115,22,0.13)" },
  Utilities: { color: "#A78BFA", bg: "rgba(167,139,250,0.13)" },
  Other: { color: "#475569", bg: "rgba(71,85,105,0.15)" },
};

export const INCOME_CATEGORY_CONFIG = {
  Salary: { color: "#10B981", bg: "rgba(16,185,129,0.13)" },
  "Side Income": { color: "#10B981", bg: "rgba(16,185,129,0.13)" },
  Refund: { color: "#38BDF8", bg: "rgba(56,189,248,0.13)" },
  Other: { color: "#475569", bg: "rgba(71,85,105,0.15)" },
};

/** Flat lookup used by transaction rows and chart legends. */
export const CATEGORY_CONFIG = {
  ...EXPENSE_CATEGORY_CONFIG,
  ...INCOME_CATEGORY_CONFIG,
};

export const EXPENSE_CATEGORY_NAMES = Object.keys(EXPENSE_CATEGORY_CONFIG);
export const INCOME_CATEGORY_NAMES = Object.keys(INCOME_CATEGORY_CONFIG);
export const PAYMENT_METHODS = [
  "Bank Transfer",
  "Credit Card",
  "Debit Card",
  "Cash",
];

// ─────────────────────────────────────────────────────────────────────────────
// 2.  DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KPI card values indexed by period selector.
 * Replace with: GET /api/summary?period=this_month
 */
export const DASHBOARD_KPI = {
  "This Month": {
    netBalance: 5_502.45,
    netDelta: { dir: "up", pct: "12.5" },
    income: 4_200.0,
    incomeDelta: { dir: "up", pct: "3.2" },
    expenses: 1_847.55,
    expensesDelta: { dir: "down", pct: "8.3" },
    savingsRate: 56.0,
    savingsDelta: { dir: "up", pct: "4.1" },
  },
  "Last Month": {
    netBalance: 4_891.1,
    netDelta: { dir: "up", pct: "6.8" },
    income: 4_070.0,
    incomeDelta: { dir: "down", pct: "1.2" },
    expenses: 2_011.9,
    expensesDelta: { dir: "up", pct: "5.0" },
    savingsRate: 50.6,
    savingsDelta: { dir: "down", pct: "2.3" },
  },
  "Last 3 Months": {
    netBalance: 14_640.0,
    netDelta: { dir: "up", pct: "9.1" },
    income: 12_400.0,
    incomeDelta: { dir: "up", pct: "2.0" },
    expenses: 5_760.0,
    expensesDelta: { dir: "up", pct: "1.5" },
    savingsRate: 53.5,
    savingsDelta: { dir: "up", pct: "1.8" },
  },
};

/**
 * Cash-flow line chart datasets indexed by period.
 * Replace with: GET /api/cashflow?period=this_month
 */
export const DASHBOARD_CHART_DATA = {
  "This Month": {
    labels: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
    income: [3_800, 4_100, 3_950, 4_200, 4_200, 4_200, 4_200],
    expenses: [2_100, 1_980, 2_200, 1_900, 2_010, 1_848, 1_848],
  },
  "Last Month": {
    labels: ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
    income: [3_700, 3_800, 4_100, 3_950, 4_200, 4_200, 4_070],
    expenses: [2_050, 2_100, 1_980, 2_200, 1_900, 2_010, 2_012],
  },
  "Last 3 Months": {
    labels: ["Nov", "Dec", "Jan", "Feb", "Mar"],
    income: [4_100, 3_950, 4_200, 4_200, 4_200],
    expenses: [1_980, 2_200, 1_900, 2_010, 1_848],
  },
};

/**
 * Expense breakdown donut chart.
 * Replace with: GET /api/expenses/breakdown?period=this_month
 */
export const DASHBOARD_DONUT = {
  labels: [
    "Housing",
    "Food & Dining",
    "Transport",
    "Shopping",
    "Health",
    "Other",
  ],
  values: [1_200, 380, 210, 290, 140, 160],
  colors: ["#6366F1", "#10B981", "#F97316", "#38BDF8", "#A78BFA", "#475569"],
};

/**
 * Budget progress rows shown on the dashboard.
 * Replace with: GET /api/budget/progress?period=this_month
 */
export const DASHBOARD_BUDGET_ROWS = [
  {
    category: "Housing / Rent",
    color: "#6366F1",
    spent: 1_200,
    planned: 1_200,
  },
  { category: "Food & Dining", color: "#10B981", spent: 380, planned: 450 },
  { category: "Transport", color: "#F97316", spent: 210, planned: 180 },
  { category: "Shopping", color: "#38BDF8", spent: 290, planned: 300 },
  { category: "Health", color: "#A78BFA", spent: 140, planned: 200 },
  { category: "Other", color: "#475569", spent: 160, planned: 150 },
];

/**
 * Recent transactions shown in the dashboard sidebar panel.
 * Replace with: GET /api/transactions?limit=6&sort=date_desc
 */
export const DASHBOARD_RECENT_TRANSACTIONS = [
  {
    id: "rt1",
    initials: "ST",
    avatarBg: "rgba(56,189,248,0.13)",
    avatarColor: "#38BDF8",
    name: "Streaming Service",
    method: "Credit Card",
    category: "Entertainment",
    date: "Apr 3",
    amount: 15.99,
    type: "expense",
  },
  {
    id: "rt2",
    initials: "SD",
    avatarBg: "rgba(16,185,129,0.13)",
    avatarColor: "#10B981",
    name: "Salary Deposit",
    method: "Bank Transfer",
    category: "Income",
    date: "Apr 1",
    amount: 4_200.0,
    type: "income",
  },
  {
    id: "rt3",
    initials: "OS",
    avatarBg: "rgba(56,189,248,0.13)",
    avatarColor: "#38BDF8",
    name: "Online Shopping",
    method: "Credit Card",
    category: "Shopping",
    date: "Mar 31",
    amount: 67.4,
    type: "expense",
  },
  {
    id: "rt4",
    initials: "GM",
    avatarBg: "rgba(249,115,22,0.13)",
    avatarColor: "#F97316",
    name: "Grocery Market",
    method: "Debit Card",
    category: "Food & Dining",
    date: "Mar 30",
    amount: 112.3,
    type: "expense",
  },
  {
    id: "rt5",
    initials: "RH",
    avatarBg: "rgba(249,115,22,0.13)",
    avatarColor: "#F97316",
    name: "Ride-Share",
    method: "Credit Card",
    category: "Transport",
    date: "Mar 29",
    amount: 22.5,
    type: "expense",
  },
  {
    id: "rt6",
    initials: "MS",
    avatarBg: "rgba(167,139,250,0.13)",
    avatarColor: "#A78BFA",
    name: "Music Subscription",
    method: "Credit Card",
    category: "Entertainment",
    date: "Mar 28",
    amount: 9.99,
    type: "expense",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3.  TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full transaction list.
 * Replace with: GET /api/transactions
 */
export const INITIAL_TRANSACTIONS = [
  // ── April 2026 ──────────────────────────────────────────────────────────
  {
    id: "t1",
    date: "2026-04-03",
    description: "Streaming Service",
    category: "Entertainment",
    type: "expense",
    amount: 15.99,
    method: "Credit Card",
  },
  {
    id: "t2",
    date: "2026-04-01",
    description: "Salary Deposit",
    category: "Salary",
    type: "income",
    amount: 4_200.0,
    method: "Bank Transfer",
  },
  {
    id: "t3",
    date: "2026-04-01",
    description: "Monthly Rent",
    category: "Housing / Rent",
    type: "expense",
    amount: 1_200.0,
    method: "Bank Transfer",
  },
  {
    id: "t4",
    date: "2026-04-02",
    description: "Grocery Market",
    category: "Food & Dining",
    type: "expense",
    amount: 112.3,
    method: "Debit Card",
  },
  {
    id: "t5",
    date: "2026-04-02",
    description: "Ride-Share",
    category: "Transport",
    type: "expense",
    amount: 22.5,
    method: "Credit Card",
  },
  // ── March 2026 ──────────────────────────────────────────────────────────
  {
    id: "t6",
    date: "2026-03-31",
    description: "Online Shopping",
    category: "Shopping",
    type: "expense",
    amount: 67.4,
    method: "Credit Card",
  },
  {
    id: "t7",
    date: "2026-03-30",
    description: "Music Subscription",
    category: "Entertainment",
    type: "expense",
    amount: 9.99,
    method: "Credit Card",
  },
  {
    id: "t8",
    date: "2026-03-28",
    description: "Salary Deposit",
    category: "Salary",
    type: "income",
    amount: 4_070.0,
    method: "Bank Transfer",
  },
  {
    id: "t9",
    date: "2026-03-27",
    description: "Pharmacy",
    category: "Health",
    type: "expense",
    amount: 34.2,
    method: "Debit Card",
  },
  {
    id: "t10",
    date: "2026-03-25",
    description: "Electric Bill",
    category: "Utilities",
    type: "expense",
    amount: 88.0,
    method: "Bank Transfer",
  },
  {
    id: "t11",
    date: "2026-03-22",
    description: "Supermarket",
    category: "Food & Dining",
    type: "expense",
    amount: 94.6,
    method: "Debit Card",
  },
  {
    id: "t12",
    date: "2026-03-20",
    description: "Freelance Project",
    category: "Side Income",
    type: "income",
    amount: 650.0,
    method: "Bank Transfer",
  },
  {
    id: "t13",
    date: "2026-03-18",
    description: "Clothing Store",
    category: "Shopping",
    type: "expense",
    amount: 145.0,
    method: "Credit Card",
  },
  {
    id: "t14",
    date: "2026-03-15",
    description: "Monthly Rent",
    category: "Housing / Rent",
    type: "expense",
    amount: 1_200.0,
    method: "Bank Transfer",
  },
  {
    id: "t15",
    date: "2026-03-10",
    description: "Purchase Refund",
    category: "Refund",
    type: "income",
    amount: 32.5,
    method: "Bank Transfer",
  },
  // ── February 2026 ────────────────────────────────────────────────────────
  {
    id: "t16",
    date: "2026-02-28",
    description: "Salary Deposit",
    category: "Salary",
    type: "income",
    amount: 4_070.0,
    method: "Bank Transfer",
  },
  {
    id: "t17",
    date: "2026-02-25",
    description: "Gym Membership",
    category: "Health",
    type: "expense",
    amount: 45.0,
    method: "Credit Card",
  },
  {
    id: "t18",
    date: "2026-02-22",
    description: "Fast Casual Dining",
    category: "Food & Dining",
    type: "expense",
    amount: 18.75,
    method: "Debit Card",
  },
  {
    id: "t19",
    date: "2026-02-20",
    description: "Gas Station",
    category: "Transport",
    type: "expense",
    amount: 62.1,
    method: "Debit Card",
  },
  {
    id: "t20",
    date: "2026-02-15",
    description: "Monthly Rent",
    category: "Housing / Rent",
    type: "expense",
    amount: 1_200.0,
    method: "Bank Transfer",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4.  BILLS & SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const BILL_FREQUENCIES = ["Monthly", "Annual", "Weekly", "Quarterly"];

export const BILL_CATEGORIES = [
  "Housing",
  "Utilities",
  "Streaming",
  "Insurance",
  "Health & Fitness",
  "Phone & Internet",
  "Subscriptions",
  "Other",
];

/** Color palette per bill category — avatar background + accent. */
export const BILL_CATEGORY_COLORS = {
  Housing: { color: "#6366F1", bg: "rgba(99,102,241,0.13)" },
  Utilities: { color: "#A78BFA", bg: "rgba(167,139,250,0.13)" },
  Streaming: { color: "#38BDF8", bg: "rgba(56,189,248,0.13)" },
  Insurance: { color: "#F97316", bg: "rgba(249,115,22,0.13)" },
  "Health & Fitness": { color: "#10B981", bg: "rgba(16,185,129,0.13)" },
  "Phone & Internet": { color: "#38BDF8", bg: "rgba(56,189,248,0.13)" },
  Subscriptions: { color: "#F97316", bg: "rgba(249,115,22,0.13)" },
  Other: { color: "#475569", bg: "rgba(71,85,105,0.15)" },
};

/**
 * Bill list.
 * Replace with: GET /api/bills
 */
export const INITIAL_BILLS = [
  {
    id: "b1",
    name: "Rent",
    category: "Housing",
    amount: 1_200.0,
    dueDate: "2026-04-01",
    frequency: "Monthly",
    status: "paid",
  },
  {
    id: "b2",
    name: "Video Streaming",
    category: "Streaming",
    amount: 15.99,
    dueDate: "2026-04-03",
    frequency: "Monthly",
    status: "paid",
  },
  {
    id: "b3",
    name: "Electric Bill",
    category: "Utilities",
    amount: 88.0,
    dueDate: "2026-04-05",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b4",
    name: "Music Streaming",
    category: "Streaming",
    amount: 9.99,
    dueDate: "2026-04-08",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b5",
    name: "Home Internet",
    category: "Phone & Internet",
    amount: 59.99,
    dueDate: "2026-04-10",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b6",
    name: "Mobile Plan",
    category: "Phone & Internet",
    amount: 65.0,
    dueDate: "2026-04-12",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b7",
    name: "Gym Membership",
    category: "Health & Fitness",
    amount: 45.0,
    dueDate: "2026-04-15",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b8",
    name: "Car Insurance",
    category: "Insurance",
    amount: 142.0,
    dueDate: "2026-04-20",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b9",
    name: "Prime Membership",
    category: "Subscriptions",
    amount: 139.0,
    dueDate: "2026-04-25",
    frequency: "Annual",
    status: "unpaid",
  },
  {
    id: "b10",
    name: "Water Bill",
    category: "Utilities",
    amount: 35.0,
    dueDate: "2026-03-25",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b11",
    name: "Creative Suite",
    category: "Subscriptions",
    amount: 54.99,
    dueDate: "2026-04-18",
    frequency: "Monthly",
    status: "unpaid",
  },
  {
    id: "b12",
    name: "TV Streaming",
    category: "Streaming",
    amount: 17.99,
    dueDate: "2026-04-22",
    frequency: "Monthly",
    status: "unpaid",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5.  BUDGET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default monthly planned amounts per category.
 * Replace with: GET /api/budget/categories
 */
export const BUDGET_CATEGORY_DEFAULTS = [
  { name: "Housing / Rent", color: "#6366F1", planned: 1_200 },
  { name: "Food & Dining", color: "#10B981", planned: 450 },
  { name: "Transport", color: "#F97316", planned: 180 },
  { name: "Shopping", color: "#38BDF8", planned: 300 },
  { name: "Health", color: "#A78BFA", planned: 200 },
  { name: "Entertainment", color: "#F97316", planned: 80 },
  { name: "Utilities", color: "#A78BFA", planned: 120 },
  { name: "Savings", color: "#A78BFA", planned: 300 },
  { name: "Debt Payments", color: "#EF4444", planned: 400 },
  { name: "Other", color: "#475569", planned: 100 },
];

/**
 * Actual spending per period, index-aligned with BUDGET_CATEGORY_DEFAULTS.
 * Replace with: GET /api/budget/actuals?period=this_month
 */
export const BUDGET_SPENT = {
  "This Month": [1_200, 380, 210, 290, 140, 25.98, 88, 0],
  "Last Month": [1_200, 475, 145, 415, 79, 15.99, 88, 45],
  "Last 3 Months": [3_600, 1_255, 555, 705, 219, 41.97, 264, 45],
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.  DEBTS
// ─────────────────────────────────────────────────────────────────────────────

export const DEBT_TYPES = [
  "Credit Card",
  "Personal Loan",
  "Student Loan",
  "Car Loan",
  "Medical",
  "Other",
];

/**
 * Debt accounts.
 * Replace with: GET /api/debts
 */
export const INITIAL_DEBTS = [
  {
    id: "d1",
    name: "Rewards Credit Card",
    type: "Credit Card",
    balance: 4_200,
    originalBalance: 6_500,
    apr: 24.99,
    minPayment: 105,
    priority: 1,
  },
  {
    id: "d2",
    name: "Student Loan",
    type: "Student Loan",
    balance: 18_500,
    originalBalance: 25_000,
    apr: 6.5,
    minPayment: 210,
    priority: 2,
  },
  {
    id: "d3",
    name: "Auto Loan",
    type: "Car Loan",
    balance: 9_800,
    originalBalance: 22_000,
    apr: 5.9,
    minPayment: 320,
    priority: 3,
  },
  {
    id: "d4",
    name: "Medical Bill",
    type: "Medical",
    balance: 1_450,
    originalBalance: 1_450,
    apr: 0,
    minPayment: 75,
    priority: 4,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 7.  SAVINGS GOALS
// ─────────────────────────────────────────────────────────────────────────────

export const SAVINGS_EMOJI_PRESETS = [
  "🎯",
  "🏠",
  "✈️",
  "💻",
  "💍",
  "🚗",
  "🎓",
  "🏖️",
  "💰",
  "📚",
  "🏋️",
  "🎸",
];

/**
 * Savings goals.
 * Replace with: GET /api/savings
 */
export const INITIAL_SAVINGS_GOALS = [
  {
    id: "s1",
    emoji: "🏦",
    name: "Emergency Fund",
    target: 5_000,
    current: 3_000,
    deadline: "2026-12-31",
  },
  {
    id: "s2",
    emoji: "✈️",
    name: "Dream Vacation",
    target: 3_500,
    current: 2_400,
    deadline: "2026-08-15",
  },
  {
    id: "s3",
    emoji: "💻",
    name: "New Laptop",
    target: 2_000,
    current: 1_800,
    deadline: "2026-06-30",
  },
  {
    id: "s4",
    emoji: "🏠",
    name: "House Down Payment",
    target: 40_000,
    current: 12_000,
    deadline: "2028-12-31",
  },
  {
    id: "s5",
    emoji: "💍",
    name: "Special Occasion Fund",
    target: 15_000,
    current: 8_500,
    deadline: "2027-03-15",
  },
  {
    id: "s6",
    emoji: "🚗",
    name: "New Vehicle",
    target: 8_000,
    current: 8_000,
    deadline: "2026-05-01",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 8.  ALERTS & NOTIFICATION RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delivery channels configuration.
 * Replace with: GET /api/alerts/channels
 */
export const INITIAL_ALERT_CHANNELS = [
  {
    id: "inapp",
    label: "In-App",
    description: "Alerts appear in the dashboard notification panel",
    icon: "🔔",
    enabled: true,
    locked: true,
    field: null,
    value: "",
    placeholder: "",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Receive alerts as WhatsApp messages via Twilio",
    icon: "💬",
    enabled: false,
    locked: false,
    field: "phone",
    value: "",
    placeholder: "+1 555 000 0000",
  },
  {
    id: "sms",
    label: "SMS",
    description: "Plain text messages to your mobile number",
    icon: "📱",
    enabled: false,
    locked: false,
    field: "phone",
    value: "",
    placeholder: "+1 555 000 0000",
  },
  {
    id: "email",
    label: "Email",
    description: "Daily digest or instant alerts to your inbox",
    icon: "✉️",
    enabled: false,
    locked: false,
    field: "email",
    value: "",
    placeholder: "you@example.com",
  },
];

/**
 * Alert rules configuration.
 * Replace with: GET /api/alerts/rules
 */
export const INITIAL_ALERT_RULES = [
  {
    id: "over_budget",
    label: "Over Budget",
    description: "Spending in a category exceeds the planned budget",
    icon: "📊",
    enabled: true,
    thresholdLabel: "Trigger at",
    thresholdUnit: "%",
    threshold: 100,
    min: 50,
    max: 150,
    step: 5,
    channels: ["inapp", "whatsapp"],
    color: "var(--color-expense)",
    colorBg: "rgba(249,115,22,0.10)",
  },
  {
    id: "spending_spike",
    label: "Spending Spike",
    description: "Spending is higher than the same category last month",
    icon: "📈",
    enabled: true,
    thresholdLabel: "Spike threshold",
    thresholdUnit: "% increase",
    threshold: 30,
    min: 10,
    max: 100,
    step: 5,
    channels: ["inapp"],
    color: "var(--color-expense)",
    colorBg: "rgba(249,115,22,0.10)",
  },
  {
    id: "bill_due",
    label: "Bill Due Soon",
    description: "An unpaid bill is approaching its due date",
    icon: "📅",
    enabled: true,
    thresholdLabel: "Remind me",
    thresholdUnit: "days before",
    threshold: 7,
    min: 1,
    max: 14,
    step: 1,
    channels: ["inapp", "whatsapp", "sms"],
    color: "var(--color-info)",
    colorBg: "rgba(56,189,248,0.10)",
  },
  {
    id: "near_limit",
    label: "Near Budget Limit",
    description: "A category is close to reaching its monthly limit",
    icon: "⚠️",
    enabled: false,
    thresholdLabel: "Alert at",
    thresholdUnit: "% of budget",
    threshold: 90,
    min: 50,
    max: 99,
    step: 5,
    channels: ["inapp"],
    color: "var(--color-savings)",
    colorBg: "rgba(167,139,250,0.10)",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 9.  SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export const CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", label: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", label: "British Pound", symbol: "£", decimals: 2 },
  { code: "COP", label: "Colombian Peso", symbol: "$", decimals: 0 },
  { code: "MXN", label: "Mexican Peso", symbol: "$", decimals: 2 },
  { code: "BRL", label: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "CAD", label: "Canadian Dollar", symbol: "$", decimals: 2 },
  { code: "ARS", label: "Argentine Peso", symbol: "$", decimals: 0 },
];

export const DATE_FORMATS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY  (04/14/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY  (14/04/2026)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD  (2026-04-14)" },
  { value: "MMM D, YYYY", label: "MMM D, YYYY  (Apr 14, 2026)" },
];

export const MONTH_START_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

/** Color swatches for the category color picker. */
export const COLOR_SWATCHES = [
  "#6366F1",
  "#10B981",
  "#F97316",
  "#38BDF8",
  "#A78BFA",
  "#EF4444",
  "#475569",
  "#F59E0B",
  "#06B6D4",
  "#84CC16",
  "#EC4899",
  "#8B5CF6",
];

/**
 * Default expense categories (seeded for Settings → Categories).
 * Replace with: GET /api/categories?type=expense
 */
export const INITIAL_EXPENSE_CATEGORIES = [
  { id: "ec1", name: "Housing / Rent", color: "#6366F1", system: true },
  { id: "ec2", name: "Food & Dining", color: "#10B981", system: true },
  { id: "ec3", name: "Transport", color: "#F97316", system: true },
  { id: "ec4", name: "Shopping", color: "#38BDF8", system: true },
  { id: "ec5", name: "Health", color: "#A78BFA", system: true },
  { id: "ec6", name: "Entertainment", color: "#F97316", system: true },
  { id: "ec7", name: "Utilities", color: "#A78BFA", system: true },
  { id: "ec8", name: "Other", color: "#475569", system: true },
];

/**
 * Default income categories.
 * Replace with: GET /api/categories?type=income
 */
export const INITIAL_INCOME_CATEGORIES = [
  { id: "ic1", name: "Salary", color: "#10B981", system: true },
  { id: "ic2", name: "Side Income", color: "#10B981", system: true },
  { id: "ic3", name: "Refund", color: "#38BDF8", system: true },
  { id: "ic4", name: "Other", color: "#475569", system: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// 10.  DEMO PERIODS (shared filter label across all views)
// ─────────────────────────────────────────────────────────────────────────────

export const PERIOD_OPTIONS = ["This Month", "Last Month", "Last 3 Months"];
