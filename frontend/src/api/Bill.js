/**
 * api/Bill.js — Bills Logic Layer
 *
 * FIX #1: Bill category dropdown now pulls expense categories from
 *         SettingsContext instead of hardcoded MockData list.
 * FIX #2: Bill avatar colors now use live colors from SettingsContext
 *         instead of the static BILL_CATEGORY_COLORS map.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/Authcontexts";

import { DEMO_TODAY, BILL_FREQUENCIES, INITIAL_BILLS } from "../data/MockData";
import { getBills, createBill, updateBill, deleteBill } from "./bills";
import { useSettings } from "../context/SettingsContext";

// ── Re-exports ────────────────────────────────────────────────────────────────

export { BILL_FREQUENCIES };

// ── Constants ─────────────────────────────────────────────────────────────────

// Always use real current date for overdue/due-soon calculations.
const TODAY = new Date();

export const BLANK_FORM = {
  name: "",
  amount: "",
  dueDate: "",
  frequency: "Monthly",
  category: "",
};

export const PAYMENT_METHODS = [
  { value: "Debit Card",      label: "Debit Card" },
  { value: "Credit Card",     label: "Credit Card" },
  { value: "Bank Transfer",   label: "Bank Transfer" },
  { value: "Cash",            label: "Cash" },
  { value: "Other",           label: "Other" },
];

let _id = 20;
export const uid = () => String(++_id);

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function formatAmount(n) {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
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

export function parseDateLocal(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysUntil(dateStr) {
  return Math.ceil((parseDateLocal(dateStr) - TODAY) / (1000 * 60 * 60 * 24));
}

export function liveStatus(bill) {
  if (bill.status === "paid") return "paid";
  const days = daysUntil(bill.dueDate);
  if (days < 0) return "overdue";
  if (days <= 7) return "due-soon";
  return "unpaid";
}

export function toMonthly(amount, frequency) {
  switch (frequency) {
    case "Annual":
      return amount / 12;
    case "Weekly":
      return (amount * 52) / 12;
    case "Quarterly":
      return amount / 3;
    default:
      return amount;
  }
}

export function formatDueDate(dateStr) {
  const d = parseDateLocal(dateStr);
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
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function dueDateLabel(bill) {
  const status = liveStatus(bill);
  if (status === "paid")
    return {
      text: formatDueDate(bill.dueDate),
      color: "var(--color-text-muted)",
    };
  const days = daysUntil(bill.dueDate);
  if (days < 0)
    return { text: `${Math.abs(days)}d overdue`, color: "var(--color-danger)" };
  if (days === 0) return { text: "Due today", color: "var(--color-expense)" };
  if (days === 1)
    return { text: "Due tomorrow", color: "var(--color-expense)" };
  if (days <= 7)
    return { text: `In ${days} days`, color: "var(--color-expense)" };
  return {
    text: formatDueDate(bill.dueDate),
    color: "var(--color-text-muted)",
  };
}

// ── API adapter ───────────────────────────────────────────────────────────────

function normalizeBill(raw) {
  return {
    id: String(raw.id),
    name: raw.name,
    amount: parseFloat(raw.amount),
    dueDate: raw.due_date,
    frequency: raw.frequency ?? "Monthly",
    category: raw.category ?? "Other",
    status: raw.status ?? "unpaid",
  };
}

// ── useBills — PRIMARY HOOK ───────────────────────────────────────────────────

export function useBills() {
  const { isDemo: IS_DEMO } = useAuth();
  const { expenseCategories, getCategoryConfig, formatAmount } = useSettings();

  const [bills, setBills] = useState(IS_DEMO ? INITIAL_BILLS : []);
  const [loading, setLoading] = useState(!IS_DEMO);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  // payModal: null | { billId: string } — shown when marking a bill as paid
  const [payModal, setPayModal] = useState(null);

  // ── FIX #1: expense category names from live SettingsContext ───────────────
  const billCategoryNames = useMemo(
    () => expenseCategories.map((c) => c.name),
    [expenseCategories],
  );

  // ── FIX #2: color lookup uses live getCategoryConfig ──────────────────────
  function catCfg(categoryName) {
    return getCategoryConfig(categoryName);
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchBills = useCallback(async () => {
    if (IS_DEMO) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getBills();
      setBills(res.data.map(normalizeBill));
    } catch (err) {
      setError("Could not load bills. Is the backend running?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      monthlyTotal: bills.reduce(
        (s, b) => s + toMonthly(b.amount, b.frequency),
        0,
      ),
      dueSoon: bills.filter((b) => liveStatus(b) === "due-soon").length,
      overdue: bills.filter((b) => liveStatus(b) === "overdue").length,
      paidCount: bills.filter((b) => b.status === "paid").length,
      paidTotal: bills
        .filter((b) => b.status === "paid")
        .reduce((s, b) => s + b.amount, 0),
    }),
    [bills],
  );

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const withStatus = bills.map((b) => ({ ...b, _status: liveStatus(b) }));
    const byFilter = withStatus.filter((b) => {
      if (filter === "Unpaid") return b._status === "unpaid";
      if (filter === "Due Soon")
        return b._status === "due-soon" || b._status === "overdue";
      if (filter === "Paid") return b._status === "paid";
      return true;
    });
    const order = { overdue: 0, "due-soon": 1, unpaid: 2, paid: 3 };
    return byFilter.sort((a, b) => {
      const diff = order[a._status] - order[b._status];
      return diff !== 0 ? diff : a.dueDate.localeCompare(b.dueDate);
    });
  }, [bills, filter]);

  const dueSoonCount = useMemo(
    () =>
      bills.filter((b) => ["due-soon", "overdue"].includes(liveStatus(b)))
        .length,
    [bills],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleTogglePaid(id) {
    const bill = bills.find((b) => b.id === id);
    if (!bill) return;

    if (bill.status !== "paid") {
      // unpaid → paid: ask for payment method first
      if (IS_DEMO) {
        setBills((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: "paid" } : b)),
        );
      } else {
        setPayModal({ billId: id });
      }
      return;
    }

    // paid → unpaid: no extra input needed, proceed directly
    if (IS_DEMO) {
      setBills((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "unpaid" } : b)),
      );
    } else {
      try {
        await updateBill(id, { status: "unpaid" });
        setBills((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: "unpaid" } : b)),
        );
      } catch (err) {
        setError("Could not update bill status.");
        console.error(err);
      }
    }
  }

  async function handleConfirmPayment(method) {
    if (!payModal) return;
    const { billId } = payModal;
    setPayModal(null);
    try {
      await updateBill(billId, { status: "paid", payment_method: method });
      setBills((prev) =>
        prev.map((b) => (b.id === billId ? { ...b, status: "paid" } : b)),
      );
    } catch (err) {
      setError("Could not mark bill as paid.");
      console.error(err);
    }
  }

  function closePayModal() {
    setPayModal(null);
  }

  function openAdd() {
    setEditingBill(null);
    // Default to first expense category if available
    const defaultCat = billCategoryNames[0] ?? "";
    setForm({ ...BLANK_FORM, category: defaultCat });
    setShowModal(true);
  }

  function openEdit(bill) {
    setEditingBill(bill);
    setForm({
      name: bill.name,
      amount: String(bill.amount),
      dueDate: bill.dueDate,
      frequency: bill.frequency,
      category: bill.category,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingBill(null);
  }

  async function handleSave() {
    const payload = {
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      due_date: form.dueDate,
      frequency: form.frequency,
      category: form.category,
      status: editingBill ? editingBill.status : "unpaid",
    };

    if (IS_DEMO) {
      if (editingBill) {
        setBills((prev) =>
          prev.map((b) =>
            b.id === editingBill.id
              ? {
                  ...b,
                  name: payload.name,
                  amount: payload.amount,
                  dueDate: payload.due_date,
                  frequency: payload.frequency,
                  category: payload.category,
                }
              : b,
          ),
        );
      } else {
        setBills((prev) => [
          ...prev,
          {
            id: uid(),
            name: payload.name,
            amount: payload.amount,
            dueDate: payload.due_date,
            frequency: payload.frequency,
            category: payload.category,
            status: "unpaid",
          },
        ]);
      }
    } else {
      try {
        if (editingBill) {
          await updateBill(editingBill.id, payload);
        } else {
          await createBill(payload);
        }
        await fetchBills();
      } catch (err) {
        setError("Save failed. Please try again.");
        console.error(err);
        return;
      }
    }
    closeModal();
  }

  async function handleDelete(id) {
    if (IS_DEMO) {
      setBills((prev) => prev.filter((b) => b.id !== id));
    } else {
      try {
        await deleteBill(id);
        setBills((prev) => prev.filter((b) => b.id !== id));
      } catch (err) {
        setError("Delete failed. Please try again.");
        console.error(err);
      }
    }
  }

  return {
    bills,
    filtered,
    loading,
    error,
    setError,
    filter,
    setFilter,
    stats,
    dueSoonCount,
    showModal,
    editingBill,
    form,
    setForm,
    openAdd,
    openEdit,
    closeModal,
    handleTogglePaid,
    handleSave,
    handleDelete,
    // Payment method modal
    payModal,
    handleConfirmPayment,
    closePayModal,
    // FIX #1: live category names for the dropdown
    billCategoryNames,
    // FIX #2: live color lookup for avatars
    catCfg,
    formatAmount, // currency-aware (from SettingsContext)
    isDemo: IS_DEMO,
  };
}
