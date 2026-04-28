/**
 * api/Dshboard.js — Dashboard Logic Layer
 *
 * FIX #5:  Dashboard budget rows now filtered to expense kind only.
 * FIX #10: Budget categories fetch moved into Promise.all — fully parallel.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/Authcontexts";
import { useNav } from "../context/NavContext";
import { useSettings } from "../context/SettingsContext";
import client from "./client";

import {
  DEMO_USER,
  DEMO_TODAY,
  PERIOD_OPTIONS,
  DASHBOARD_KPI,
  DASHBOARD_CHART_DATA,
  DASHBOARD_DONUT,
  DASHBOARD_BUDGET_ROWS,
  DASHBOARD_RECENT_TRANSACTIONS,
  CATEGORY_CONFIG,
} from "../data/MockData";

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_MAP = {
  "This Month": "this_month",
  "Last Month": "last_month",
  "Last 3 Months": "last_3_months",
};

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatAmount(n) {
  return (
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function formatAmountK(n) {
  if (Math.abs(n) >= 1_000) return "$" + (Math.abs(n) / 1_000).toFixed(1) + "k";
  return formatAmount(n);
}

// ── Period subtitle ───────────────────────────────────────────────────────────

export function getPeriodSubtitle(period) {
  const base = new Date(); // always use real current date
  const year = base.getFullYear();

  if (period === "This Month")
    return base.toLocaleString("en-US", { month: "long" }) + " " + year;

  if (period === "Last Month") {
    const prev = new Date(year, base.getMonth() - 1, 1);
    return (
      prev.toLocaleString("en-US", { month: "long" }) + " " + prev.getFullYear()
    );
  }

  const start = new Date(year, base.getMonth() - 2, 1);
  return (
    start.toLocaleString("en-US", { month: "short" }) +
    " – " +
    base.toLocaleString("en-US", { month: "short" }) +
    " " +
    year
  );
}

// ── Chart.js style tokens ─────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "#1E2435",
  titleColor: "#F1F5F9",
  bodyColor: "#94A3B8",
  borderColor: "rgba(255,255,255,0.1)",
  borderWidth: 0.5,
  padding: 10,
};

const AXIS_STYLE = {
  x: {
    grid: { color: "rgba(255,255,255,0.04)" },
    border: { color: "rgba(255,255,255,0.06)" },
    ticks: { color: "#5E6E85", font: { size: 11 } },
  },
  y: {
    grid: { color: "rgba(255,255,255,0.04)" },
    border: { color: "rgba(255,255,255,0.06)" },
    ticks: { color: "#5E6E85", font: { size: 11 } },
  },
};

// ── Chart config builders ─────────────────────────────────────────────────────

export function getOverviewChartConfig(chartData) {
  return {
    type: "line",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "Income",
          data: chartData.income,
          borderColor: "#10B981",
          backgroundColor: "rgba(16,185,129,0.06)",
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#10B981",
          pointBorderWidth: 0,
        },
        {
          label: "Expenses",
          data: chartData.expenses,
          borderColor: "#F97316",
          backgroundColor: "rgba(249,115,22,0.05)",
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#F97316",
          pointBorderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: { ...AXIS_STYLE.x },
        y: {
          ...AXIS_STYLE.y,
          ticks: {
            ...AXIS_STYLE.y.ticks,
            callback: (v) => "$" + (v / 1_000).toFixed(1) + "k",
          },
        },
      },
    },
  };
}

// ── Balance Trend chart config builder ───────────────────────────────────────
//
// Two overlapping filled-area lines for single-month periods:
//   • Balance   — starts at projectedOpening, moves ±each week (indigo area)
//   • Spent so far — starts at 0, accumulates expenses weekly (orange area)
//
// A "Start" anchor point is prepended so the opening value is visible.

export function getBalanceTrendConfig(chartData, projectedOpening) {
  if (!chartData?.labels?.length) return null;

  const labels = ["Start", ...chartData.labels];
  const balLine = [Math.max(0, projectedOpening)];
  const spentLine = [0];

  let running = projectedOpening;
  let spent = 0;
  let incomeAccum = 0;

  for (let i = 0; i < chartData.income.length; i++) {
    incomeAccum += chartData.income[i];
    running += chartData.income[i] - chartData.expenses[i];
    spent += chartData.expenses[i];

    // Balance can never go below zero — in real life you can't hold a negative
    // bank balance without a loan/overdraft which would itself be an income entry.
    const safeBalance = Math.max(0, running);

    // Spending can never exceed what was actually available to spend:
    // everything you started with plus every dollar of income received so far.
    const availableToSpend = Math.max(0, projectedOpening) + incomeAccum;
    const safeSpent = Math.min(spent, availableToSpend);

    balLine.push(safeBalance);
    spentLine.push(safeSpent);
  }

  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Balance",
          data: balLine,
          borderColor: "#6366F1",
          backgroundColor: "rgba(99,102,241,0.13)",
          fill: true,
          tension: 0.45,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: "#6366F1",
          pointBorderColor: "#1E2435",
          pointBorderWidth: 1.5,
          pointHoverRadius: 6,
        },
        {
          label: "Spent so far",
          data: spentLine,
          borderColor: "#F97316",
          backgroundColor: "rgba(249,115,22,0.09)",
          fill: true,
          tension: 0.45,
          borderWidth: 1.5,
          pointRadius: 3,
          pointBackgroundColor: "#F97316",
          pointBorderColor: "#1E2435",
          pointBorderWidth: 1.5,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
          },
        },
      },
      scales: {
        x: { ...AXIS_STYLE.x },
        y: {
          ...AXIS_STYLE.y,
          ticks: {
            ...AXIS_STYLE.y.ticks,
            callback: (v) => "$" + (v / 1_000).toFixed(1) + "k",
          },
        },
      },
    },
  };
}

export function getDonutChartConfig(donutData) {
  return {
    type: "doughnut",
    data: {
      labels: donutData.labels,
      datasets: [
        {
          data: donutData.values,
          backgroundColor: donutData.colors,
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: { label: (ctx) => ` $${ctx.parsed.toLocaleString()}` },
        },
      },
    },
  };
}

// ── Donut legend builder ──────────────────────────────────────────────────────

export function buildDonutLegend(donutData) {
  const total = donutData.values.reduce((a, b) => a + b, 0);
  return donutData.labels.map((label, i) => ({
    label,
    color: donutData.colors[i],
    value: donutData.values[i],
    pct: total > 0 ? ((donutData.values[i] / total) * 100).toFixed(1) : "0.0",
  }));
}

// ── Recent transaction normalizer ─────────────────────────────────────────────

function normalizeRecentTx(raw, categoryConfig) {
  const cfg = categoryConfig[raw.category] ?? {
    color: "#475569",
    bg: "rgba(71,85,105,0.15)",
  };
  const words = (raw.description ?? "").trim().split(/\s+/);
  const inits = words
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const d = new Date(raw.date + "T00:00:00");
  const dateLbl = d.toLocaleString("en-US", { month: "short", day: "numeric" });

  return {
    id: String(raw.id),
    initials: inits,
    avatarBg: cfg.bg,
    avatarColor: cfg.color,
    name: raw.description,
    method: raw.payment_method ?? "—",
    category: raw.category,
    date: dateLbl,
    amount: parseFloat(raw.amount),
    type: raw.type,
  };
}

// ── Empty fallbacks ───────────────────────────────────────────────────────────

const EMPTY_KPI = {
  income: 0,
  expenses: 0,
  net_balance: 0,
  savings_rate: 0,
  income_delta: { dir: "up", pct: "0.0" },
  expenses_delta: { dir: "up", pct: "0.0" },
  net_delta: { dir: "up", pct: "0.0" },
  savings_delta: { dir: "up", pct: "0.0" },
  opening_delta: { dir: "up", pct: "0.0" },
};
const EMPTY_CHART = { labels: [], income: [], expenses: [] };
const EMPTY_DONUT = { labels: [], values: [], colors: [] };

// ── useDashboard ──────────────────────────────────────────────────────────────

export function useDashboard() {
  const { isDemo: IS_DEMO, user: authUser } = useAuth();
  const [period, setPeriod] = useState("This Month");
  const navigate = useNav();
  const {
    getAllCategoryConfig,
    formatAmount,
    displayName,
    bankBalance,
    bankBalanceDate,
    balanceAnchorApp,
    initialBalance,
    showBalanceGap,
  } = useSettings();

  const [kpiData, setKpiData] = useState(EMPTY_KPI);
  const [chartData, setChartData] = useState(EMPTY_CHART);
  const [donutData, setDonutData] = useState(EMPTY_DONUT);
  const [budgetRows, setBudgetRows] = useState([]);
  const [recentTxRaw, setRecentTxRaw] = useState([]);
  const [savingsTotal, setSavingsTotal] = useState(null); // sum of goal current_amounts
  const [debtTotal, setDebtTotal] = useState(null); // sum of debt balances
  const [upcomingBills, setUpcomingBills] = useState([]); // unpaid bills due ≤ 30 days
  const [plannedIncome, setPlannedIncome] = useState(null); // sum of income budget planned
  const [loading, setLoading] = useState(!IS_DEMO);
  const [slowLoad, setSlowLoad] = useState(false); // true when load takes >2.5 s
  const [error, setError] = useState(null);

  // ── FIX #10: All API calls in a single Promise.all ─────────────────────────
  const fetchAll = useCallback(async (activePeriod) => {
    if (IS_DEMO) return;

    setLoading(true);
    setSlowLoad(false);
    setError(null);

    // After 2.5 s still loading → show a "waking up server" hint.
    // Clears itself when the load completes (fast or slow).
    const slowTimer = setTimeout(() => setSlowLoad(true), 2500);

    const p = PERIOD_MAP[activePeriod] ?? "this_month";

    try {
      const [
        summaryRes,
        cashflowRes,
        breakdownRes,
        actualsRes,
        txRes,
        budgetCatsRes,
        savingsRes,
        debtsRes,
        billsRes,
        incomeCatsRes,
      ] = await Promise.all([
        client.get(`/summary?period=${p}`),
        client.get(`/cashflow?period=${p}`),
        client.get(`/expenses/breakdown?period=${p}`),
        client.get(`/budget/actuals?period=${p}&kind=expense`), // FIX #5: expense only
        client.get(
          `/transactions/?date_from=${_periodStart(activePeriod)}&date_to=${_periodEnd(activePeriod)}`,
        ),
        client.get("/budget/categories?kind=expense"), // FIX #5 + #10: in parallel
        client.get("/savings").catch(() => ({ data: [] })), // net worth component
        client.get("/debts").catch(() => ({ data: [] })), // net worth component
        client.get("/bills").catch(() => ({ data: [] })), // upcoming bills panel
        client
          .get("/budget/categories?kind=income")
          .catch(() => ({ data: [] })), // planned income
      ]);

      setKpiData(summaryRes.data);
      setChartData(cashflowRes.data);
      setDonutData(breakdownRes.data);

      // FIX #5: budgetCats already filtered to expense kind by the API call above
      const budgetCats = budgetCatsRes.data;
      const actualsMap = Object.fromEntries(
        actualsRes.data.map((a) => [a.category, a.spent]),
      );
      //const mult = activePeriod === "Last 3 Months" ? 3 : 1;

      setBudgetRows(
        budgetCats.map((c) => ({
          category: c.name,
          color: c.color,
          planned: parseFloat(c.planned) * mult,
          spent: actualsMap[c.name] ?? 0,
        })),
      );

      const sorted = [...txRes.data]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 6);
      setRecentTxRaw(sorted);

      // Net worth components
      const sTotal = savingsRes.data.reduce(
        (acc, g) => acc + parseFloat(g.current_amount ?? 0),
        0,
      );
      const dTotal = debtsRes.data.reduce(
        (acc, d) => acc + parseFloat(d.balance ?? 0),
        0,
      );
      setSavingsTotal(sTotal);
      setDebtTotal(dTotal);

      // Upcoming bills: unpaid bills due within the next 30 days
      const today30 = new Date();
      today30.setDate(today30.getDate() + 30);
      const todayStr = new Date().toISOString().slice(0, 10);
      const cutoffStr = today30.toISOString().slice(0, 10);
      const upcoming = (billsRes.data ?? [])
        .filter(
          (b) =>
            b.status === "unpaid" &&
            b.due_date >= todayStr &&
            b.due_date <= cutoffStr,
        )
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, 5);
      setUpcomingBills(upcoming);

      // Planned income total from income budget categories
      const mult = activePeriod === "Last 3 Months" ? 3 : 1;
      const pIncome = (incomeCatsRes.data ?? []).reduce(
        (s, c) => s + (parseFloat(c.planned) || 0) * mult,
        0,
      );
      setPlannedIncome(pIncome);
    } catch (err) {
      setError("Could not load dashboard data.");
      console.error(err);
    } finally {
      clearTimeout(slowTimer);
      setSlowLoad(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (IS_DEMO) return;
    fetchAll(period);
  }, [period, fetchAll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const categoryConfig = useMemo(
    () => getAllCategoryConfig(),
    [getAllCategoryConfig],
  );

  const recentTransactions = useMemo(() => {
    if (IS_DEMO) return DASHBOARD_RECENT_TRANSACTIONS;
    return recentTxRaw.map((tx) => normalizeRecentTx(tx, categoryConfig));
  }, [recentTxRaw, categoryConfig]);

  const kpi = IS_DEMO
    ? DASHBOARD_KPI[period]
    : {
        netBalance: kpiData.net_balance,
        // liquidNet: income − expenses (savings not subtracted).
        // Saving money should not look like losing money on the balance card.
        liquidNet: kpiData.liquid_net ?? kpiData.income - kpiData.expenses,
        openingBalance: kpiData.opening_balance ?? 0,
        closingBalance: kpiData.closing_balance ?? kpiData.net_balance,
        income: kpiData.income,
        expenses: kpiData.expenses,
        savingsAmount: kpiData.savings ?? 0,
        savingsRate: kpiData.savings_rate,
        netDelta: kpiData.net_delta,
        incomeDelta: kpiData.income_delta,
        expensesDelta: kpiData.expenses_delta,
        savingsDelta: kpiData.savings_delta,
        closingDelta: kpiData.closing_delta ?? kpiData.net_delta,
        openingDelta: kpiData.opening_delta ?? kpiData.net_delta,
      };

  // ── Projected bank balance ────────────────────────────────────────────────
  // Only meaningful for "This Month" — the anchor is a present-day snapshot so
  // projecting it onto past periods would show the same balance in every view.
  // For Last Month / Last 3 Months the card falls into Mode B (transaction-based
  // opening → closing) which tells the correct retrospective story.
  //
  //   projected = bank_balance + (current_closing − balance_anchor_app)
  //
  // Every new transaction updates current_closing, so the headline auto-updates
  // without the user having to re-enter their balance.
  const projectedBankBalance = (() => {
    if (IS_DEMO || bankBalance === null) return null;
    if (period !== "This Month") return null; // anchor is present-day only
    if (balanceAnchorApp === null) return bankBalance;
    const currentClosing = kpiData.closing_balance ?? 0;
    return bankBalance + (currentClosing - balanceAnchorApp);
  })();

  // ── Balance Trend chart ───────────────────────────────────────────────────
  // Only meaningful for single-month views — Last 3 Months is a compilation
  // with monthly buckets that don't suit the week-by-week story.
  const balanceTrendConfig = useMemo(() => {
    if (IS_DEMO || period === "Last 3 Months") return null;
    if (!chartData.labels?.length) return null;

    const rawOpening = kpiData.opening_balance ?? 0;
    const rawClosing = kpiData.closing_balance ?? 0;
    const monthNet = rawClosing - rawOpening;

    let chartOpening;

    if (projectedBankBalance !== null) {
      // This Month + bank balance set: derive projected opening from projected
      // closing so the chart starts from real money, not tracked-only figures.
      chartOpening = projectedBankBalance - monthNet;
    } else if (bankBalance !== null && balanceAnchorApp !== null) {
      // Last Month (projectedBankBalance is null for past periods): the historical
      // gap between the app's tracking and the real bank is a constant offset —
      // it was exactly the same last month as it is today, so we can apply it
      // retroactively to get a realistic opening for the chart.
      //   offset = bankBalance − balanceAnchorApp
      //   projectedLastMonthOpening = rawOpening + offset
      chartOpening = rawOpening + (bankBalance - balanceAnchorApp);
    } else {
      // No anchor at all — use raw opening but clamp to 0 so the chart at least
      // starts at a non-negative value (avoids the spending-above-balance absurdity
      // caused by historical data gaps).
      chartOpening = Math.max(0, rawOpening);
    }

    return getBalanceTrendConfig(chartData, chartOpening);
  }, [
    IS_DEMO,
    period,
    chartData,
    kpiData,
    projectedBankBalance,
    bankBalance,
    balanceAnchorApp,
  ]);

  const donutLegend = useMemo(() => {
    return buildDonutLegend(IS_DEMO ? DASHBOARD_DONUT : donutData);
  }, [donutData]);

  const overviewChartConfig = useMemo(() => {
    return getOverviewChartConfig(
      IS_DEMO ? DASHBOARD_CHART_DATA[period] : chartData,
    );
  }, [chartData, period]);

  const donutChartConfig = useMemo(() => {
    return getDonutChartConfig(IS_DEMO ? DASHBOARD_DONUT : donutData);
  }, [donutData]);

  // ── Net worth ─────────────────────────────────────────────────────────────
  // (bank_balance OR closing_balance) + savings_totals − debt_totals
  // All three numbers live in separate tables; we just sum them here.
  // null = still loading (hide the card until both fetches resolve).
  const netWorth = (() => {
    if (IS_DEMO) return null; // hide in demo
    if (savingsTotal === null || debtTotal === null) return null;
    const liquidBase = projectedBankBalance ?? kpi.closingBalance ?? 0;
    return liquidBase + savingsTotal - debtTotal;
  })();

  return {
    period,
    setPeriod,
    periodOptions: PERIOD_OPTIONS,
    periodSubtitle: getPeriodSubtitle(period),
    user: IS_DEMO
      ? DEMO_USER
      : {
          // Prefer the stored display name; fall back to the part before @ in email
          name:
            displayName ??
            (authUser?.email ? authUser.email.split("@")[0] : "User"),
          email: authUser?.email ?? "",
        },
    kpi,
    donutLegend,
    budgetRows: IS_DEMO ? DASHBOARD_BUDGET_ROWS : budgetRows,
    recentTransactions,
    overviewChartConfig,
    donutChartConfig,
    balanceTrendConfig,
    loading,
    slowLoad,
    error,
    formatAmount,
    // Bank balance reconciliation — only relevant for BalanceCard
    showBalanceGap: IS_DEMO ? false : (showBalanceGap ?? false),
    bankBalance: projectedBankBalance, // projected forward from anchor
    bankBalanceDate: IS_DEMO ? null : (bankBalanceDate ?? null),
    initialBalance: IS_DEMO ? null : (initialBalance ?? null),
    // Net worth breakdown
    netWorth,
    netWorthSavings: savingsTotal,
    netWorthDebts: debtTotal,
    // Upcoming bills
    upcomingBills: IS_DEMO ? [] : upcomingBills,
    // Planned income (for mid-month context on INCOME card)
    plannedIncome: IS_DEMO ? null : plannedIncome,
    goToBudget: () => navigate("budget"),
    goToTransactions: () => navigate("transactions"),
    goToSettings: () => navigate("settings"),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _periodStart(period) {
  const today = new Date();
  if (period === "This Month")
    return new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
  if (period === "Last Month") {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return d.toISOString().slice(0, 10);
  }
  if (period === "Last 3 Months") {
    const d = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    return d.toISOString().slice(0, 10);
  }
  return new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

/**
 * FIX: Returns the inclusive last day of the selected period.
 * Without this, the dashboard recent-transactions fetch for "Last Month"
 * had no upper bound and returned this month's transactions too.
 */
function _periodEnd(period) {
  const today = new Date();
  if (period === "This Month") return today.toISOString().slice(0, 10);
  if (period === "Last Month") {
    // Last day of last month = day 0 of this month
    const d = new Date(today.getFullYear(), today.getMonth(), 0);
    return d.toISOString().slice(0, 10);
  }
  // Last 3 Months — ends today
  return today.toISOString().slice(0, 10);
}
