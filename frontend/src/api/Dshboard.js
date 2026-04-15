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
};
const EMPTY_CHART = { labels: [], income: [], expenses: [] };
const EMPTY_DONUT = { labels: [], values: [], colors: [] };

// ── useDashboard ──────────────────────────────────────────────────────────────

export function useDashboard() {
  const { isDemo: IS_DEMO, user: authUser } = useAuth();
  const [period, setPeriod] = useState("This Month");
  const navigate = useNav();
  const { getAllCategoryConfig, formatAmount, displayName } = useSettings();

  const [kpiData, setKpiData] = useState(EMPTY_KPI);
  const [chartData, setChartData] = useState(EMPTY_CHART);
  const [donutData, setDonutData] = useState(EMPTY_DONUT);
  const [budgetRows, setBudgetRows] = useState([]);
  const [recentTxRaw, setRecentTxRaw] = useState([]);
  const [loading, setLoading] = useState(!IS_DEMO);
  const [error, setError] = useState(null);

  // ── FIX #10: All API calls in a single Promise.all ─────────────────────────
  const fetchAll = useCallback(async (activePeriod) => {
    if (IS_DEMO) return;

    setLoading(true);
    setError(null);

    const p = PERIOD_MAP[activePeriod] ?? "this_month";

    try {
      const [
        summaryRes,
        cashflowRes,
        breakdownRes,
        actualsRes,
        txRes,
        budgetCatsRes,
      ] = await Promise.all([
        client.get(`/summary?period=${p}`),
        client.get(`/cashflow?period=${p}`),
        client.get(`/expenses/breakdown?period=${p}`),
        client.get(`/budget/actuals?period=${p}&kind=expense`), // FIX #5: expense only
        client.get(`/transactions/?date_from=${_periodStart(activePeriod)}&date_to=${_periodEnd(activePeriod)}`),
        client.get("/budget/categories?kind=expense"), // FIX #5 + #10: in parallel
      ]);

      setKpiData(summaryRes.data);
      setChartData(cashflowRes.data);
      setDonutData(breakdownRes.data);

      // FIX #5: budgetCats already filtered to expense kind by the API call above
      const budgetCats = budgetCatsRes.data;
      const actualsMap = Object.fromEntries(
        actualsRes.data.map((a) => [a.category, a.spent]),
      );
      const mult = activePeriod === "Last 3 Months" ? 3 : 1;

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
    } catch (err) {
      setError("Could not load dashboard data.");
      console.error(err);
    } finally {
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
        netBalance:      kpiData.net_balance,
        openingBalance:  kpiData.opening_balance ?? 0,
        closingBalance:  kpiData.closing_balance ?? kpiData.net_balance,
        income:          kpiData.income,
        expenses:        kpiData.expenses,
        savingsRate:     kpiData.savings_rate,
        netDelta:        kpiData.net_delta,
        incomeDelta:     kpiData.income_delta,
        expensesDelta:   kpiData.expenses_delta,
        savingsDelta:    kpiData.savings_delta,
        closingDelta:    kpiData.closing_delta ?? kpiData.net_delta,
      };

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

  return {
    period,
    setPeriod,
    periodOptions: PERIOD_OPTIONS,
    periodSubtitle: getPeriodSubtitle(period),
    user: IS_DEMO
      ? DEMO_USER
      : {
          // Prefer the stored display name; fall back to the part before @ in email
          name: displayName
            ?? (authUser?.email ? authUser.email.split("@")[0] : "User"),
          email: authUser?.email ?? "",
        },
    kpi,
    donutLegend,
    budgetRows: IS_DEMO ? DASHBOARD_BUDGET_ROWS : budgetRows,
    recentTransactions,
    overviewChartConfig,
    donutChartConfig,
    loading,
    error,
    formatAmount,
    goToBudget: () => navigate("budget"),
    goToTransactions: () => navigate("transactions"),
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
