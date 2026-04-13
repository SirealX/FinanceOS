/**
 * api/Transaction.js — Transactions Logic Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTH UPDATE: IS_DEMO now comes from AuthContext (useAuth().isDemo) instead
 * of the build-time VITE_DEMO_MODE env var. This allows the "View Demo"
 * button on the login page to work at runtime without a separate build.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/Authcontexts";

import {
  DEMO_TODAY,
  PERIOD_OPTIONS,
  CATEGORY_CONFIG,
  PAYMENT_METHODS,
  INITIAL_TRANSACTIONS,
} from "../data/MockData";

import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "./transactions";

// ── Re-exports ────────────────────────────────────────────────────────────────

export { PERIOD_OPTIONS, CATEGORY_CONFIG, PAYMENT_METHODS };

// ── Constants ─────────────────────────────────────────────────────────────────

export const BLANK_FORM = {
  description: "",
  amount: "",
  date: DEMO_TODAY,
  type: "expense",
  category: "Food & Dining",
  method: "",
};

// ── Category grouping ─────────────────────────────────────────────────────────

const KIND_LABELS = {
  expense: "── Expenses ──────────────",
  income: "── Income ────────────────",
};

const KIND_ORDER = ["expense", "income"];

export function buildCategoryGroups(allCategories, type) {
  const allowed = type === "income" ? ["income"] : ["expense"];

  const grouped = {};
  for (const kind of KIND_ORDER) {
    if (!allowed.includes(kind)) continue;
    const names = allCategories
      .filter((c) => c.kind === kind)
      .sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      )
      .map((c) => c.name);
    if (names.length > 0) grouped[kind] = names;
  }

  return Object.entries(grouped).map(([kind, options]) => ({
    header: KIND_LABELS[kind],
    options,
  }));
}

export function flatCategoryNames(allCategories, type) {
  return buildCategoryGroups(allCategories, type).flatMap((g) => g.options);
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

let _nextId = 100;
export function uid() {
  return String(++_nextId);
}

export function initials(str) {
  return str
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function fmt(n) {
  return (
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

export function periodBounds(filter) {
  const base = new Date(DEMO_TODAY + "T00:00:00");
  const year = base.getFullYear();
  const month = base.getMonth();

  if (filter === "This Month") return { year, months: [month] };
  if (filter === "Last Month") {
    const prev = new Date(year, month - 1, 1);
    return { year: prev.getFullYear(), months: [prev.getMonth()] };
  }
  if (filter === "Last 3 Months") {
    return {
      bounds: [-2, -1, 0].map((offset) => {
        const d = new Date(year, month + offset, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      }),
    };
  }
  return null;
}

export function inPeriod(dateStr, filter) {
  const b = periodBounds(filter);
  if (!b) return true;
  const d = new Date(dateStr + "T00:00:00");
  const dy = d.getFullYear();
  const dm = d.getMonth();
  if (b.bounds) return b.bounds.some((p) => p.year === dy && p.month === dm);
  return dy === b.year && b.months.includes(dm);
}

// ── API adapter ───────────────────────────────────────────────────────────────

function normalizeTransaction(raw) {
  return {
    id: String(raw.id),
    date: raw.date,
    description: raw.description,
    category: raw.category,
    type: raw.type,
    amount: parseFloat(raw.amount),
    method: raw.payment_method ?? null,
    isDraft: raw.is_draft ?? false,
    categoryLocked: raw.category_locked ?? false,
    typeLocked: raw.type_locked ?? false,
    hubType: raw.hub_type ?? null,
  };
}

// ── useTransactions — PRIMARY HOOK ────────────────────────────────────────────

export function useTransactions() {
  // AUTH: IS_DEMO is now runtime state from AuthContext
  const { isDemo: IS_DEMO } = useAuth();
  const { allCategories, getCategoryConfig } = useSettings();

  const [transactions, setTransactions] = useState(
    IS_DEMO ? INITIAL_TRANSACTIONS : [],
  );
  const [loading, setLoading] = useState(!IS_DEMO);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("All");
  const [periodFilter, setPeriodFilter] = useState("This Month");
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);

  const categoryGroups = useMemo(
    () => buildCategoryGroups(allCategories, form.type),
    [allCategories, form.type],
  );

  const validCategoryNames = useMemo(
    () => flatCategoryNames(allCategories, form.type),
    [allCategories, form.type],
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    if (IS_DEMO) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getTransactions();
      setTransactions(res.data.map(normalizeTransaction));
    } catch (err) {
      setError("Could not load transactions. Is the backend running?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [IS_DEMO]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // ── Filtered + sorted view ────────────────────────────────────────────────
  const filtered = transactions
    .filter((tx) => {
      if (typeFilter === "Income") return tx.type === "income";
      if (typeFilter === "Expense") return tx.type === "expense";
      if (typeFilter === "Savings") return tx.type === "savings";
      return true;
    })
    .filter((tx) => inPeriod(tx.date, periodFilter))
    .sort((a, b) => b.date.localeCompare(a.date));

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalIncome = filtered
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filtered
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const totalSavings = filtered
    .filter((t) => t.type === "savings")
    .reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpenses - totalSavings;
  const draftCount = transactions.filter((t) => t.isDraft).length;

  // ── Modal handlers ────────────────────────────────────────────────────────
  function openAdd() {
    const defaultCat =
      flatCategoryNames(allCategories, "expense")[0] ?? "Other";
    setEditingTx(null);
    setForm({ ...BLANK_FORM, category: defaultCat });
    setShowModal(true);
  }

  function openEdit(tx) {
    setEditingTx(tx);
    setForm({
      description: tx.description,
      amount: String(tx.amount),
      date: tx.date,
      type: tx.type,
      category: tx.category,
      method: tx.method ?? "",
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingTx(null);
  }

  function handleTypeChange(newType) {
    const names = flatCategoryNames(allCategories, newType);
    const currentIsValid = names.includes(form.category);
    setForm((prev) => ({
      ...prev,
      type: newType,
      category: currentIsValid ? prev.category : (names[0] ?? ""),
    }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const payload = {
      description: form.description.trim(),
      amount: parseFloat(form.amount),
      date: form.date,
      type: form.type,
      category: form.category,
      payment_method: form.method || null,
      is_draft: false,
    };

    if (IS_DEMO) {
      if (editingTx) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingTx.id
              ? { ...t, ...payload, method: form.method }
              : t,
          ),
        );
      } else {
        setTransactions((prev) => [
          { id: uid(), method: form.method, ...payload },
          ...prev,
        ]);
      }
    } else {
      try {
        if (editingTx) {
          await updateTransaction(editingTx.id, payload);
        } else {
          await createTransaction(payload);
        }
        await fetchTransactions();
      } catch (err) {
        setError("Save failed. Please try again.");
        console.error(err);
        return;
      }
    }
    closeModal();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function handleDelete(id) {
    setDeletingId(id);
  }
  function handleCancelDelete() {
    setDeletingId(null);
  }

  async function handleConfirmDelete(id) {
    if (IS_DEMO) {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } else {
      try {
        await deleteTransaction(id);
        setTransactions((prev) => prev.filter((t) => t.id !== id));
      } catch (err) {
        setError("Delete failed. Please try again.");
        console.error(err);
      }
    }
    setDeletingId(null);
  }

  return {
    transactions,
    filtered,
    loading,
    error,
    setError,
    typeFilter,
    setTypeFilter,
    periodFilter,
    setPeriodFilter,
    totalIncome,
    totalExpenses,
    totalSavings,
    net,
    draftCount,
    showModal,
    editingTx,
    form,
    setForm,
    openAdd,
    openEdit,
    closeModal,
    deletingId,
    handleDelete,
    handleCancelDelete,
    handleConfirmDelete,
    handleSave,
    handleTypeChange,
    categoryGroups,
    validCategoryNames,
    getCategoryConfig,
    isDemo: IS_DEMO,
  };
}
