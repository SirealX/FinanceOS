/**
 * api/MonthEndReview.js — Month-End Review Logic Layer (#25)
 *
 * Assembles a full month-end scorecard from existing API endpoints.
 * Read-only: no mutations. Shows the previous month by default so users
 * can close out the books on a completed period.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/Authcontexts";
import { useSettings } from "../context/SettingsContext";
import client from "./client";

import {
  BUDGET_CATEGORY_DEFAULTS,
  BUDGET_SPENT,
  INITIAL_BILLS,
  INITIAL_DEBTS,
} from "../data/MockData";

// ── Period options ─────────────────────────────────────────────────────────────

export const REVIEW_PERIODS = ["Last Month", "This Month"];

const PERIOD_MAP = {
  "This Month":  "this_month",
  "Last Month":  "last_month",
};

// ── Demo helpers ───────────────────────────────────────────────────────────────

function buildDemoData(period) {
  // Budget categories + mock spend for the period
  const spentArr = BUDGET_SPENT[period] ?? BUDGET_SPENT["Last Month"] ?? [];
  const categories = BUDGET_CATEGORY_DEFAULTS.map((c, i) => ({
    name:         c.name,
    color:        c.color,
    planned:      c.planned ?? 0,
    actual:       spentArr[i] ?? 0,
    kind:         "expense",
    is_active:    true,
  }));

  const totalIncome   = period === "This Month" ? 4200 : 4070;
  const totalExpenses = categories.reduce((s, c) => s + c.actual, 0);
  const totalSavings  = period === "This Month" ? 300 : 0;
  const net           = totalIncome - totalExpenses - totalSavings;

  const bills = INITIAL_BILLS.map((b) => ({
    ...b,
    // In demo, treat bills due before the 15th as paid
    status: b.dueDate && parseInt(b.dueDate.split("-")[2]) <= 15 ? "paid" : "unpaid",
  }));
  const billsPaid   = bills.filter((b) => b.status === "paid");
  const billsUnpaid = bills.filter((b) => b.status !== "paid");

  const debts = INITIAL_DEBTS;
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const totalMin  = debts.reduce((s, d) => s + d.minPayment, 0);

  return {
    period,
    summary: { totalIncome, totalExpenses, totalSavings, net },
    categories,
    bills:        { paid: billsPaid, unpaid: billsUnpaid, paidTotal: billsPaid.reduce((s, b) => s + b.amount, 0) },
    debt:         { total: totalDebt, minPayment: totalMin, count: debts.length },
    insights:     buildInsights(categories, billsUnpaid.length, net),
  };
}

// ── Insight builder ────────────────────────────────────────────────────────────

export function buildInsights(categories, unpaidBillCount, net) {
  const insights = [];
  const overBudget = categories.filter(
    (c) => c.is_active !== false && c.planned > 0 && c.actual > c.planned,
  );
  const underBudget = categories.filter(
    (c) => c.is_active !== false && c.planned > 0 && c.actual < c.planned,
  );

  if (overBudget.length === 0 && unpaidBillCount === 0) {
    insights.push({ type: "win", text: "Perfect month — all budgets met and bills paid! 🎉" });
  } else {
    if (overBudget.length > 0) {
      const names = overBudget.map((c) => c.name).join(", ");
      insights.push({
        type: "warning",
        text: `${overBudget.length} categor${overBudget.length === 1 ? "y" : "ies"} over budget: ${names}.`,
      });
    }
    if (underBudget.length > 0) {
      insights.push({
        type: "win",
        text: `${underBudget.length} categor${underBudget.length === 1 ? "y" : "ies"} came in under budget — good discipline.`,
      });
    }
  }

  if (unpaidBillCount > 0) {
    insights.push({
      type: "warning",
      text: `${unpaidBillCount} bill${unpaidBillCount > 1 ? "s" : ""} still unpaid this period.`,
    });
  }

  if (net > 0) {
    insights.push({ type: "win", text: `Net positive month — you kept ${net > 0 ? "more than you spent" : "pace"}.` });
  } else if (net < 0) {
    insights.push({ type: "warning", text: "Net negative month — expenses exceeded income this period." });
  }

  return insights;
}

// ── Primary hook ───────────────────────────────────────────────────────────────

export function useMonthEndReview() {
  const { isDemo: IS_DEMO } = useAuth();
  const { formatAmount, currencySymbol } = useSettings();

  const formatAmountK = useCallback(
    (n) => {
      const abs = Math.abs(n);
      if (abs >= 1_000) return currencySymbol + (abs / 1_000).toFixed(1) + "k";
      return formatAmount(n);
    },
    [currencySymbol, formatAmount],
  );

  const [period, setPeriod] = useState("Last Month");
  const [loading, setLoading]   = useState(!IS_DEMO);
  const [error, setError]       = useState(null);

  // Raw fetched data
  const [summary, setSummary]         = useState(null);
  const [categories, setCategories]   = useState([]);
  const [bills, setBills]             = useState({ paid: [], unpaid: [], paidTotal: 0 });
  const [debt, setDebt]               = useState({ total: 0, minPayment: 0, count: 0 });
  const [insights, setInsights]       = useState([]);

  // ── Demo seed ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!IS_DEMO) return;
    const demo = buildDemoData(period);
    setSummary(demo.summary);
    setCategories(demo.categories);
    setBills(demo.bills);
    setDebt(demo.debt);
    setInsights(demo.insights);
    setLoading(false);
  }, [IS_DEMO, period]);

  // ── Live fetch ───────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (IS_DEMO) return;
    setLoading(true);
    setError(null);
    const p = PERIOD_MAP[period] ?? "last_month";
    try {
      const [summaryRes, catsRes, actualsRes, billsRes, debtsRes] = await Promise.all([
        client.get(`/summary?period=${p}`),
        client.get("/budget/categories"),
        client.get(`/budget/actuals?period=${p}`),
        client.get("/bills").catch(() => ({ data: [] })),
        client.get("/debts").catch(() => ({ data: [] })),
      ]);

      // ── Summary ────────────────────────────────────────────────────────────
      const s = summaryRes.data ?? {};
      const totalIncome   = parseFloat(s.total_income   ?? s.totalIncome   ?? 0);
      const totalExpenses = parseFloat(s.total_expenses ?? s.totalExpenses ?? 0);
      const totalSavings  = parseFloat(s.total_savings  ?? s.totalSavings  ?? 0);
      const net           = totalIncome - totalExpenses - totalSavings;
      setSummary({ totalIncome, totalExpenses, totalSavings, net });

      // ── Budget categories + actuals ────────────────────────────────────────
      const actuals = actualsRes.data ?? [];
      const cats = (catsRes.data ?? [])
        .filter((c) => c.kind === "expense" && c.is_active !== false)
        .map((c) => {
          const match = actuals.find((a) => a.category === c.name);
          return {
            name:      c.name,
            color:     c.color,
            planned:   parseFloat(c.planned ?? 0),
            actual:    match ? parseFloat(match.spent) : 0,
            kind:      c.kind,
            is_active: c.is_active,
          };
        });
      setCategories(cats);

      // ── Bills ──────────────────────────────────────────────────────────────
      const allBills  = billsRes.data ?? [];
      const paidBills = allBills.filter((b) => b.status === "paid");
      const unpaidBills = allBills.filter((b) => b.status !== "paid");
      setBills({
        paid:      paidBills,
        unpaid:    unpaidBills,
        paidTotal: paidBills.reduce((s, b) => s + parseFloat(b.amount ?? 0), 0),
      });

      // ── Debt ────────────────────────────────────────────────────────────────
      const debts = debtsRes.data ?? [];
      setDebt({
        total:      debts.reduce((s, d) => s + parseFloat(d.balance ?? 0), 0),
        minPayment: debts.reduce((s, d) => s + parseFloat(d.min_payment ?? 0), 0),
        count:      debts.length,
      });

      // ── Insights ────────────────────────────────────────────────────────────
      setInsights(buildInsights(cats, unpaidBills.length, net));

    } catch (err) {
      setError("Could not load review data. Is the backend running?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [IS_DEMO, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const budgetScore = useMemo(() => {
    if (categories.length === 0) return null;
    const graded = categories.filter((c) => c.planned > 0);
    if (graded.length === 0) return null;
    const passed = graded.filter((c) => c.actual <= c.planned).length;
    return { passed, total: graded.length, pct: Math.round((passed / graded.length) * 100) };
  }, [categories]);

  return {
    period,
    setPeriod,
    loading,
    error,
    setError,
    summary,
    categories,
    bills,
    debt,
    insights,
    budgetScore,
    formatAmount,
    formatAmountK,
    isDemo: IS_DEMO,
  };
}
