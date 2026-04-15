/**
 * api/Debt.js — Debts Logic Layer
 *
 * FIX #6: Debt simulator slider is now currency-aware.
 *         Currencies that use large denominations (COP, ARS, etc.) get
 *         appropriate step and max values instead of hardcoded USD ones.
 * FIX #7: Simulate logic verified — avalanche targets highest APR,
 *         snowball targets lowest balance. Both correct. No change needed.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/Authcontexts";
import { DEBT_TYPES, INITIAL_DEBTS } from "../data/MockData";
import { getDebts, createDebt, updateDebt, deleteDebt, payDebt } from "./debts";
import { useSettings } from "../context/SettingsContext";

// ── Re-exports ────────────────────────────────────────────────────────────────

export { DEBT_TYPES };

// ── Constants ─────────────────────────────────────────────────────────────────

export const SIM_MAX_MONTHS = 360;

export const BLANK_FORM = {
  name: "",
  type: "Credit Card",
  balance: "",
  originalBalance: "",
  apr: "",
  minPayment: "",
};

let _id = 10;
export const uid = () => String(++_id);

// ── FIX #6: Currency-aware slider parameters ──────────────────────────────────
// Currencies that don't express amounts in small increments need different
// step and max values so the slider is actually usable.

const LARGE_DENOMINATION_CURRENCIES = new Set([
  "COP",
  "ARS",
  "IDR",
  "VND",
  "KRW",
  "CLP",
  "UYU",
]);

export function getSliderParams(currency) {
  if (LARGE_DENOMINATION_CURRENCIES.has(currency)) {
    // e.g. COP: step of 50,000, max of 10,000,000 (~$2,500 USD)
    return { min: 0, max: 10_000_000, step: 50_000 };
  }
  if (currency === "JPY" || currency === "HUF") {
    return { min: 0, max: 300_000, step: 1_000 };
  }
  // Standard currencies: USD, EUR, GBP, MXN, BRL, CAD, etc.
  return { min: 0, max: 2_000, step: 25 };
}

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

export function formatAmountK(n) {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return formatAmount(n);
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

export function monthsToLabel(m) {
  if (m >= SIM_MAX_MONTHS) return "30+ years";
  const yrs = Math.floor(m / 12);
  const mos = m % 12;
  if (yrs === 0) return `${mos}mo`;
  if (mos === 0) return `${yrs}yr`;
  return `${yrs}yr ${mos}mo`;
}

export function downsample(arr, maxPoints = 60) {
  if (arr.length <= maxPoints) return arr;
  const step = arr.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.round(i * step)]);
}

// ── FIX #7: Payoff simulator — logic verified correct ────────────────────────
// Avalanche: targets highest APR first (minimises total interest).
// Snowball:  targets lowest balance first (maximises early wins).
// The two strategies produce different results when:
//   a) there are multiple debts with different APRs / balances, AND
//   b) extraPayment > 0.
// With a single debt or extraPayment = 0, both strategies are identical
// by definition — that is correct behaviour, not a bug.

export function simulate(debts, extraPayment) {
  function run(strategy) {
    const d = debts.map((x) => ({ ...x, balance: +x.balance }));
    let months = 0;
    let totalInterest = 0;
    const history = [d.reduce((s, x) => s + x.balance, 0)];

    while (months < SIM_MAX_MONTHS) {
      const total = d.reduce((s, x) => s + x.balance, 0);
      if (total < 0.5) break;

      // 1. Apply monthly interest
      d.forEach((x) => {
        if (x.balance > 0) {
          const interest = x.balance * (x.apr / 100 / 12);
          x.balance += interest;
          totalInterest += interest;
        }
      });

      // 2. Apply minimum payments
      d.forEach((x) => {
        if (x.balance > 0) {
          x.balance = Math.max(
            0,
            x.balance - Math.min(x.minPayment, x.balance),
          );
        }
      });

      // 3. Throw extra at the priority target
      const active = d.filter((x) => x.balance > 0.5);
      if (active.length > 0 && extraPayment > 0) {
        const target =
          strategy === "avalanche"
            ? active.reduce((best, x) => (x.apr > best.apr ? x : best))
            : active.reduce((best, x) => (x.balance < best.balance ? x : best));
        target.balance = Math.max(0, target.balance - extraPayment);
      }

      months++;
      history.push(
        Math.max(
          0,
          d.reduce((s, x) => s + x.balance, 0),
        ),
      );
    }

    return { months, totalInterest, history };
  }

  return { avalanche: run("avalanche"), snowball: run("snowball") };
}

// ── API adapter ───────────────────────────────────────────────────────────────

function normalizeDebt(raw) {
  return {
    id: String(raw.id),
    name: raw.name,
    type: raw.type ?? "Other",
    balance: parseFloat(raw.balance),
    originalBalance: parseFloat(raw.original_balance ?? raw.balance),
    apr: parseFloat(raw.interest_rate),
    minPayment: parseFloat(raw.min_payment),
    priority: raw.priority_rank ?? 1,
  };
}

function buildPayload(form, existingDebt) {
  const bal     = parseFloat(form.balance);
  const origBal = parseFloat(form.originalBalance);
  return {
    name:             form.name.trim(),
    balance:          bal,
    // Always send original_balance so edits and new entries are stored correctly.
    // If the user left it blank we fall back to the current balance (first-time entry).
    original_balance: !isNaN(origBal) ? Math.max(origBal, bal) : bal,
    interest_rate:    parseFloat(form.apr) || 0,
    min_payment:      parseFloat(form.minPayment),
    priority_rank:    existingDebt ? existingDebt.priority : 999,
  };
}

// ── useDebts — PRIMARY HOOK ───────────────────────────────────────────────────

export function useDebts() {
  const { isDemo: IS_DEMO } = useAuth();
  const { currency, formatAmount } = useSettings();

  const [debts, setDebts] = useState(IS_DEMO ? INITIAL_DEBTS : []);
  const [loading, setLoading] = useState(!IS_DEMO);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [extraPmt, setExtraPmt] = useState(0); // start at 0; user slides up
  const [payingDebt, setPayingDebt] = useState(null);

  // FIX #6: slider params derived from current currency setting
  const sliderParams = useMemo(() => getSliderParams(currency), [currency]);

  const fetchDebts = useCallback(async () => {
    if (IS_DEMO) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getDebts();
      setDebts(res.data.map(normalizeDebt));
    } catch (err) {
      setError("Could not load debts. Is the backend running?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDebts();
  }, [fetchDebts]);

  const stats = useMemo(() => {
    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
    const totalMin = debts.reduce((s, d) => s + d.minPayment, 0);
    const interestBearing = debts.filter((d) => d.apr > 0);
    const avgApr =
      interestBearing.length > 0
        ? interestBearing.reduce((s, d) => s + d.apr, 0) /
          interestBearing.length
        : 0;
    return { totalDebt, totalMin, avgApr };
  }, [debts]);

  const sim = useMemo(() => {
    if (debts.length === 0) return null;
    return simulate(debts, extraPmt);
  }, [debts, extraPmt]);

  const interestSaved = sim
    ? Math.max(0, sim.snowball.totalInterest - sim.avalanche.totalInterest)
    : 0;
  const monthsSaved = sim
    ? Math.max(0, sim.snowball.months - sim.avalanche.months)
    : 0;

  function openAdd() {
    setEditingDebt(null);
    setForm(BLANK_FORM);
    setShowModal(true);
  }
  function openEdit(debt) {
    setEditingDebt(debt);
    setForm({
      name: debt.name,
      type: debt.type,
      balance: String(debt.balance),
      originalBalance: String(debt.originalBalance),
      apr: String(debt.apr),
      minPayment: String(debt.minPayment),
    });
    setShowModal(true);
  }
  function closeModal() {
    setShowModal(false);
    setEditingDebt(null);
  }

  async function handleSave() {
    const bal = parseFloat(form.balance);
    const origBal = parseFloat(form.originalBalance) || bal;

    if (IS_DEMO) {
      const entry = {
        id: editingDebt ? editingDebt.id : uid(),
        name: form.name.trim(),
        type: form.type,
        balance: bal,
        originalBalance: Math.max(origBal, bal),
        apr: parseFloat(form.apr) || 0,
        minPayment: parseFloat(form.minPayment),
        priority: editingDebt ? editingDebt.priority : debts.length + 1,
      };
      if (editingDebt) {
        setDebts((prev) =>
          prev.map((d) => (d.id === editingDebt.id ? entry : d)),
        );
      } else {
        setDebts((prev) => [...prev, entry]);
      }
      closeModal();
      return;
    }

    try {
      if (editingDebt) {
        await updateDebt(editingDebt.id, buildPayload(form, editingDebt));
      } else {
        await createDebt(buildPayload(form, null));
      }
      await fetchDebts();
      closeModal();
    } catch (err) {
      setError("Save failed. Please try again.");
      console.error(err);
    }
  }

  async function handlePay(debt, amount, method) {
    if (IS_DEMO) {
      setDebts((prev) =>
        prev.map((d) =>
          d.id === debt.id
            ? { ...d, balance: Math.max(0, d.balance - amount) }
            : d,
        ),
      );
      setPayingDebt(null);
      return;
    }
    try {
      await payDebt(debt.id, { amount, payment_method: method });
      await fetchDebts();
      setPayingDebt(null);
    } catch (err) {
      setError("Payment failed. Please try again.");
      console.error(err);
    }
  }

  async function handleDelete(id) {
    if (IS_DEMO) {
      setDebts((prev) => prev.filter((d) => d.id !== id));
      return;
    }
    try {
      await deleteDebt(id);
      setDebts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError("Delete failed. Please try again.");
      console.error(err);
    }
  }

  return {
    debts,
    loading,
    error,
    setError,
    sim,
    extraPmt,
    setExtraPmt,
    interestSaved,
    monthsSaved,
    stats,
    showModal,
    editingDebt,
    form,
    setForm,
    openAdd,
    openEdit,
    closeModal,
    handleSave,
    handleDelete,
    payingDebt,
    setPayingDebt,
    handlePay,
    sliderParams, // FIX #6: expose to Debts.jsx
    formatAmount, // currency-aware (from SettingsContext)
    isDemo: IS_DEMO,
  };
}
