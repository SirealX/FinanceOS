/**
 * frontend/src/api/Budget.js — Budget Logic Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Now handles all three kinds: expense, income, savings.
 * Tab switcher: All | Expenses | Income | Savings
 * All tab  → Option B (3 KPI cards + grouped bar chart + grouped rows)
 * Other tabs → filtered detailed view
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/Authcontexts";
import { useSettings } from "../context/SettingsContext";

import {
  PERIOD_OPTIONS,
  BUDGET_CATEGORY_DEFAULTS,
  BUDGET_SPENT,
} from "../data/MockData";

import {
  getBudgetCategories,
  updateBudgetCategories,
  getBudgetActuals,
} from "./budget.axios";

// ── Re-exports ────────────────────────────────────────────────────────────────

export { PERIOD_OPTIONS };

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_MAP = {
  "This Month": "this_month",
  "Last Month": "last_month",
  "Last 3 Months": "last_3_months",
};

export const BUDGET_TABS = [
  { id: "all", label: "All" },
  { id: "expense", label: "Expenses" },
  { id: "income", label: "Income" },
  { id: "savings", label: "Savings" },
  { id: "debt_payment", label: "Debt Pmts" },
];

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatAmount(n) {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function formatAmountK(n) {
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "k";
  return formatAmount(n);
}

export function shortName(name) {
  const MAP = {
    "Housing / Rent": "Housing",
    "Food & Dining": "Food",
    Transport: "Transport",
    Shopping: "Shopping",
    Health: "Health",
    Entertainment: "Entertain.",
    Utilities: "Utilities",
    Savings: "Savings",
    "Debt Payments": "Debt Pmts",
    Other: "Other",
  };
  return MAP[name] ?? name.slice(0, 10);
}

export function periodMultiplier(period) {
  return period === "Last 3 Months" ? 3 : 1;
}

// ── Shared surplus/deficit formula ───────────────────────────────────────────
//
// Single source of truth for "how much money is actually left over."
// Expenses, savings, and debt payments are money going OUT — they only ever
// subtract. Income is the only kind that adds, and even then only the
// non-variable ("FIX") rows count toward the real, counted-on number.
// Variable ("VAR") income is real money that MIGHT show up, so it's surfaced
// separately as a best-case add-on, never folded into the guaranteed figure.
// Used by both the All-tab summary banner and the "Set Monthly Budget"
// popup preview, so the two can never drift back out of sync with each other.
//
// `rows` — flat array of { kind, amount, is_variable?, is_active? }
//   kind: "expense" | "income" | "savings" | "debt_payment"
export function computeBudgetSurplus(rows) {
  const active = rows.filter((r) => r.is_active !== false);

  const sum = (kind, filterFn = () => true) =>
    active
      .filter((r) => r.kind === kind && filterFn(r))
      .reduce((s, r) => s + (r.amount || 0), 0);

  const expenseTotal = sum("expense");
  const savingsTotal = sum("savings");
  const debtTotal = sum("debt_payment");
  const guaranteedIncome = sum("income", (r) => !r.is_variable);
  const variableIncome = sum("income", (r) => !!r.is_variable);

  const outflow = expenseTotal + savingsTotal + debtTotal;
  const guaranteedSurplus = guaranteedIncome - outflow;
  const bestCaseSurplus = guaranteedIncome + variableIncome - outflow;

  return {
    expenseTotal,
    savingsTotal,
    debtTotal,
    guaranteedIncome,
    variableIncome,
    guaranteedSurplus,
    bestCaseSurplus,
    hasVariableIncome: variableIncome > 0,
  };
}

// ── Chart config builders ─────────────────────────────────────────────────────

/** Grouped bar chart for a single kind (Expenses, Income, or Savings tab) */
export function getBudgetChartConfig(rows, fmtK = formatAmountK) {
  const labels = rows.map((r) => shortName(r.name));
  const planned = rows.map((r) => +r.scaledPlanned.toFixed(2));
  const actual = rows.map((r) => r.actual);

  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Planned",
          data: planned,
          backgroundColor: rows.map((r) => r.color + "30"),
          borderRadius: 4,
          barPercentage: 0.75,
          categoryPercentage: 0.7,
          order: 2,
        },
        {
          label: "Actual",
          data: actual,
          backgroundColor: rows.map((r, i) =>
            actual[i] > planned[i] ? "#EF4444" : r.color,
          ),
          borderRadius: 4,
          barPercentage: 0.75,
          categoryPercentage: 0.7,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 }, // FIX #9: no animation so tab switches are instant
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1E2435",
          titleColor: "#F1F5F9",
          bodyColor: "#94A3B8",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 0.5,
          padding: 10,
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: ${fmtK(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#5E6E85", font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          border: { color: "rgba(255,255,255,0.06)" },
          ticks: {
            color: "#5E6E85",
            font: { size: 10 },
            callback: (v) => fmtK(v),
          },
        },
      },
    },
  };
}

/** Grouped bar chart for the All tab — four side-by-side bars per group */
export function getAllTabChartConfig(expenseRows, incomeRows, savingsRows, fmtK = formatAmountK, debtPaymentRows = []) {
  // Show one bar group per kind with totals (include debt_payment only when present)
  const hasDebt = debtPaymentRows.length > 0;
  const labels  = hasDebt
    ? ["Expenses", "Income", "Savings", "Debt Pmts"]
    : ["Expenses", "Income", "Savings"];
  const planned = [
    expenseRows.reduce((s, r) => s + r.scaledPlanned, 0),
    incomeRows.reduce((s, r) => s + r.scaledPlanned, 0),
    savingsRows.reduce((s, r) => s + r.scaledPlanned, 0),
    ...(hasDebt ? [debtPaymentRows.reduce((s, r) => s + r.scaledPlanned, 0)] : []),
  ];
  const actual = [
    expenseRows.reduce((s, r) => s + r.actual, 0),
    incomeRows.reduce((s, r) => s + r.actual, 0),
    savingsRows.reduce((s, r) => s + r.actual, 0),
    ...(hasDebt ? [debtPaymentRows.reduce((s, r) => s + r.actual, 0)] : []),
  ];
  const colors = hasDebt
    ? ["#F97316", "#10B981", "#A78BFA", "#EF4444"]
    : ["#F97316", "#10B981", "#A78BFA"];

  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Planned",
          data: planned,
          backgroundColor: colors.map((c) => c + "30"),
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.6,
          order: 2,
        },
        {
          label: "Actual",
          data: actual,
          backgroundColor: colors,
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.6,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 }, // FIX #9: no animation so tab switches are instant
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1E2435",
          titleColor: "#F1F5F9",
          bodyColor: "#94A3B8",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 0.5,
          padding: 10,
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: ${fmtK(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#5E6E85", font: { size: 11 } },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          border: { color: "rgba(255,255,255,0.06)" },
          ticks: {
            color: "#5E6E85",
            font: { size: 10 },
            callback: (v) => fmtK(v),
          },
        },
      },
    },
  };
}

// ── Demo actuals helper ───────────────────────────────────────────────────────

const DEMO_INCOME_SPENT = {
  "This Month": [4200, 0, 0, 0],
  "Last Month": [4070, 650, 0, 32.5],
  "Last 3 Months": [12340, 650, 0, 32.5],
};
const DEMO_SAVINGS_SPENT = {
  "This Month": [300],
  "Last Month": [0],
  "Last 3 Months": [300],
};
const DEMO_DEBT_PAYMENT_SPENT = {
  "This Month": [250, 120],
  "Last Month": [250, 120],
  "Last 3 Months": [750, 360],
};

// ── useBudget — PRIMARY HOOK ──────────────────────────────────────────────────

export function useBudget() {
  const { isDemo: IS_DEMO } = useAuth();
  const { formatAmount, currencySymbol } = useSettings();

  // Currency-aware compact formatter for chart ticks / tooltips.
  const formatAmountKCurrency = useCallback(
    (n) => {
      const abs = Math.abs(n);
      if (abs >= 1_000) return currencySymbol + (abs / 1_000).toFixed(1) + "k";
      return formatAmount(n);
    },
    [currencySymbol, formatAmount],
  );
  const [allCategories, setAllCategories] = useState([]);
  const [actuals, setActuals] = useState([]);
  const [period, setPeriod] = useState("This Month");
  const [budgetTab, setBudgetTab] = useState("all");
  const [loading, setLoading] = useState(!IS_DEMO);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // ── Demo seed ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!IS_DEMO) return;
    // Build demo category list from MockData defaults + system income + savings
    const expenseCats = BUDGET_CATEGORY_DEFAULTS.map((c) => ({
      ...c,
      kind: "expense",
      is_active: true,
      is_variable: false,
    }));
    const incomeCats = [
      { name: "Salary",      color: "#10B981", planned: 4200, kind: "income", is_active: true, is_variable: false },
      { name: "Side Income", color: "#10B981", planned: 500,  kind: "income", is_active: true, is_variable: true  },
      { name: "Refund",      color: "#38BDF8", planned: 0,    kind: "income", is_active: true, is_variable: true  },
      { name: "Other Income",color: "#475569", planned: 0,    kind: "income", is_active: true, is_variable: true  },
    ];
    const savingsCats = [
      { name: "Savings", color: "#A78BFA", planned: 300, kind: "savings", is_active: true, is_variable: false },
    ];
    setAllCategories([...expenseCats, ...incomeCats, ...savingsCats]);
  }, []);

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    if (IS_DEMO) return;
    try {
      const res = await getBudgetCategories();
      setAllCategories(res.data); // now includes kind field
    } catch (err) {
      setError("Could not load budget categories.");
      console.error(err);
    }
  }, []);

  const fetchActuals = useCallback(async (activePeriod) => {
    if (IS_DEMO) return;
    const p = PERIOD_MAP[activePeriod] ?? "this_month";
    try {
      const res = await getBudgetActuals(p);
      setActuals(res.data); // [{ category, type, spent }]
    } catch (err) {
      setError("Could not load spending actuals.");
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (IS_DEMO) return;
    async function init() {
      setLoading(true);
      await Promise.all([fetchCategories(), fetchActuals(period)]);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!IS_DEMO) fetchActuals(period);
  }, [period, fetchActuals]);

  // ── Derived rows per kind ─────────────────────────────────────────────────
  const mult = periodMultiplier(period);

  // Names that have been migrated to debt_payment — built once per render
  const migratedToDebtPayment = useMemo(
    () => new Set(allCategories.filter((c) => c.kind === "debt_payment").map((c) => c.name)),
    [allCategories],
  );

  function buildRows(kind) {
    // All categories of this kind.
    // For expenses: suppress any category whose name now lives under debt_payment
    // (migration artifact — users who had "Debt Payments" as an expense category
    // before the restructure would otherwise see it in both sections).
    let cats = allCategories.filter((c) => c.kind === kind);
    if (kind === "expense") {
      cats = cats.filter((c) => !migratedToDebtPayment.has(c.name));
    }

    if (IS_DEMO) {
      if (kind === "expense") {
        const spentArr = BUDGET_SPENT[period] ?? [];
        return cats.map((c, i) => ({
          ...c,
          actual: spentArr[i] ?? 0,
          scaledPlanned: (c.planned ?? 0) * mult,
        }));
      }
      if (kind === "income") {
        const spentArr = DEMO_INCOME_SPENT[period] ?? [];
        return cats.map((c, i) => ({
          ...c,
          actual: spentArr[i] ?? 0,
          scaledPlanned: (c.planned ?? 0) * mult,
        }));
      }
      if (kind === "savings") {
        const spentArr = DEMO_SAVINGS_SPENT[period] ?? [];
        return cats.map((c, i) => ({
          ...c,
          actual: spentArr[i] ?? 0,
          scaledPlanned: (c.planned ?? 0) * mult,
        }));
      }
      if (kind === "debt_payment") {
        const spentArr = DEMO_DEBT_PAYMENT_SPENT[period] ?? [];
        return cats.map((c, i) => ({
          ...c,
          actual: spentArr[i] ?? 0,
          scaledPlanned: (c.planned ?? 0) * mult,
        }));
      }
    }

    return cats.map((c) => {
      const match = actuals.find((a) => a.category === c.name && a.type === kind);
      return {
        ...c,
        actual: match ? match.spent : 0,
        scaledPlanned: (c.planned ?? 0) * mult,
      };
    });
  }

  const expenseRows = useMemo(
    () => buildRows("expense"),
    [allCategories, actuals, period, mult],
  );
  const incomeRows = useMemo(
    () => buildRows("income"),
    [allCategories, actuals, period, mult],
  );
  const savingsRows = useMemo(
    () => buildRows("savings"),
    [allCategories, actuals, period, mult],
  );
  const debtPaymentRows = useMemo(
    () => buildRows("debt_payment"),
    [allCategories, actuals, period, mult],
  );

  // ── Stats per kind ────────────────────────────────────────────────────────
  function buildStats(rows, kind) {
    // #3 — only active categories count toward budget totals
    const active = rows.filter((r) => r.is_active !== false);
    const totalPlanned = active.reduce((s, r) => s + r.scaledPlanned, 0);
    const totalActual  = active.reduce((s, r) => s + r.actual, 0);
    const overCount    = active.filter(
      (r) => r.scaledPlanned > 0 && r.actual > r.scaledPlanned,
    ).length;
    const remaining  = Math.max(totalPlanned - totalActual, 0);
    const overallPct =
      totalPlanned > 0 ? Math.min((totalActual / totalPlanned) * 100, 100) : 0;

    // #16 — guaranteed vs variable split (meaningful for income rows only)
    const guaranteed = kind === "income"
      ? active.filter((r) => !r.is_variable)
      : active;
    const variable = kind === "income"
      ? active.filter((r) => r.is_variable)
      : [];
    const guaranteedPlanned = guaranteed.reduce((s, r) => s + r.scaledPlanned, 0);
    const variablePlanned   = variable.reduce((s, r) => s + r.scaledPlanned, 0);
    const guaranteedActual  = guaranteed.reduce((s, r) => s + r.actual, 0);
    const variableActual    = variable.reduce((s, r) => s + r.actual, 0);

    return {
      totalPlanned, totalActual, overCount, remaining, overallPct,
      guaranteedPlanned, variablePlanned, guaranteedActual, variableActual,
    };
  }

  const expenseStats = useMemo(
    () => buildStats(expenseRows, "expense"),
    [expenseRows],
  );
  const incomeStats = useMemo(
    () => buildStats(incomeRows, "income"),  // #16 — includes guaranteed/variable split
    [incomeRows],
  );
  const savingsStats = useMemo(
    () => buildStats(savingsRows, "savings"),
    [savingsRows],
  );
  const debtPaymentStats = useMemo(
    () => buildStats(debtPaymentRows, "debt_payment"),
    [debtPaymentRows],
  );

  // ── Active rows and stats for current tab ─────────────────────────────────
  const activeRows =
    budgetTab === "expense"
      ? expenseRows
      : budgetTab === "income"
        ? incomeRows
        : budgetTab === "savings"
          ? savingsRows
          : budgetTab === "debt_payment"
            ? debtPaymentRows
            : [...expenseRows, ...incomeRows, ...savingsRows, ...debtPaymentRows];

  const activeStats =
    budgetTab === "expense"
      ? expenseStats
      : budgetTab === "income"
        ? incomeStats
        : budgetTab === "savings"
          ? savingsStats
          : budgetTab === "debt_payment"
            ? debtPaymentStats
            : null; // All tab uses individual kind stats

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openModal() {
    setShowModal(true);
  }
  function closeModal() {
    setShowModal(false);
  }

  async function handleSave(updatedCategories) {
    if (IS_DEMO) {
      setAllCategories((prev) => {
        const map = Object.fromEntries(
          updatedCategories.map((c) => [c.name, c]),
        );
        return prev.map((c) =>
          map[c.name]
            ? {
                ...c,
                planned:     map[c.name].planned,
                color:       map[c.name].color,
                is_active:   map[c.name].is_active   ?? true,
                is_variable: map[c.name].is_variable ?? false,
              }
            : c,
        );
      });
      closeModal();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = updatedCategories.map((c, i) => ({
        name:        c.name,
        color:       c.color,
        planned:     c.planned,
        sort_order:  i,
        kind:        c.kind,
        is_active:   c.is_active   ?? true,
        is_variable: c.is_variable ?? false,
      }));
      const res = await updateBudgetCategories(payload);
      setAllCategories(res.data);
      await fetchActuals(period);
      closeModal();
    } catch (err) {
      setError("Could not save budget. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return {
    // All categories split by kind
    expenseRows,
    incomeRows,
    savingsRows,
    debtPaymentRows,
    expenseStats,
    incomeStats,
    savingsStats,
    debtPaymentStats,

    // Active tab data
    activeRows,
    activeStats,
    allCategories,

    // Tab + period
    budgetTab,
    setBudgetTab,
    period,
    setPeriod,

    // UI state
    loading,
    error,
    setError,
    saving,
    showModal,
    openModal,
    closeModal,
    handleSave,

    formatAmount,                          // currency-aware (from SettingsContext)
    formatAmountK: formatAmountKCurrency,  // compact version, respects currency
    isDemo: IS_DEMO,
  };
}
