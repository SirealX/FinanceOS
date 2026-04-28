/**
 * frontend/src/api/Savings.js — Savings Logic Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * All non-rendering logic for the Savings Goals view.
 * No JSX in this file. Follows the same pattern as Debts.js and Bill.js.
 *
 * EXPORTS
 *   formatAmount                — currency formatter
 *   pct                — progress percentage (capped at 100)
 *   daysLeft           — days remaining until deadline
 *   deadlineLabel      — { text, color } label for the goal card footer
 *   remaining          — amount still needed to reach target
 *   SAVINGS_EMOJI_PRESETS — re-exported from MockData
 *   useSavings         — primary hook consumed by Savings.jsx
 *
 * DEMO MODE  (VITE_DEMO_MODE=true)
 *   • Seeds state from INITIAL_SAVINGS_GOALS in MockData
 *   • CRUD and fund contributions mutate local state only
 *
 * LIVE MODE  (VITE_DEMO_MODE=false)
 *   • GET  /savings         → fetch all goals on mount
 *   • POST /savings         → create goal
 *   • PUT  /savings/{id}    → update goal fields
 *   • PUT  /savings/{id}/contribute → add funds (backend adds to current_amount)
 *   • DELETE /savings/{id}  → delete goal
 *
 * NOTE ON FIELD NAMES
 *   Backend uses snake_case: goal_name, target_amount, current_amount, deadline_date
 *   Frontend uses camelCase: name, target, current, deadline
 *   normalizeSavingsGoal() maps incoming; buildGoalPayload() maps outgoing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/Authcontexts";

import {
  DEMO_TODAY,
  SAVINGS_EMOJI_PRESETS,
  INITIAL_SAVINGS_GOALS,
} from "../data/MockData";

import {
  getSavings,
  createSavingsGoal,
  updateSavingsGoal,
  logContribution,
  deleteSavingsGoal,
} from "./savings";

import { useSettings } from "../context/SettingsContext";

// ─────────────────────────────────────────────────────────────────────────────
// 1. RE-EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export { SAVINGS_EMOJI_PRESETS };

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical "today" for deadline calculations — always real current date. */
const TODAY = new Date();

export const BLANK_GOAL_FORM = {
  emoji: "🎯",
  name: "",
  target: "",
  current: "0",
  deadline: "2027-01-01",
};

export const BLANK_FUNDS_FORM = { amount: "", note: "" };

let _id = 10;
export const uid = () => String(++_id);

// ─────────────────────────────────────────────────────────────────────────────
// 3. PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** "$1,234.56" */
export function formatAmount(n) {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Progress as a percentage, capped at 100. */
export function pct(current, target) {
  if (target === 0) return 0;
  return Math.min((current / target) * 100, 100);
}

/** Days remaining from TODAY until the deadline (negative = overdue). */
export function daysLeft(deadlineStr) {
  const d = new Date(deadlineStr + "T00:00:00");
  return Math.ceil((d - TODAY) / (1000 * 60 * 60 * 24));
}

/**
 * Returns { text, color } for the goal card deadline footer.
 * Returns null when the goal is already complete (no deadline shown).
 */
export function deadlineLabel(deadlineStr, isComplete) {
  if (isComplete) return null;
  const days = daysLeft(deadlineStr);
  if (days < 0)
    return { text: `${Math.abs(days)}d overdue`, color: "var(--color-danger)" };
  if (days === 0) return { text: "Due today", color: "var(--color-expense)" };
  if (days <= 30)
    return { text: `${days}d left`, color: "var(--color-expense)" };
  if (days <= 90)
    return { text: `${days}d left`, color: "var(--color-text-secondary)" };
  const d = new Date(deadlineStr + "T00:00:00");
  const mo = d.toLocaleString("en-US", { month: "short" });
  return { text: `${mo} ${d.getFullYear()}`, color: "var(--color-text-muted)" };
}

/** Amount still needed to reach the target (floor at 0). */
export function remaining(goal) {
  return Math.max(goal.target - goal.current, 0);
}

/**
 * On-track status for a savings goal.
 * Returns an object with:
 *   monthlyNeeded  — how much to save per month to hit target by deadline
 *   monthsLeft     — calendar months remaining (float, can be < 0)
 *   label          — human-readable summary string
 *   color          — CSS var appropriate to urgency
 *
 * Pure function — no side-effects, no network calls.
 *
 * @param {object}   goal — normalized savings goal ({ current, target, deadline })
 * @param {function} fmt  — optional currency-aware formatter, e.g. formatAmount from
 *                          SettingsContext.  Defaults to a basic USD formatter so the
 *                          function remains callable without a React context (tests,
 *                          storybooks, etc.).  Always pass fmt in real UI code so the
 *                          label respects the user's chosen currency.
 */
export function goalStatus(goal, fmt) {
  // Fall back to a basic formatter only when no currency-aware one is provided.
  // In practice every call-site inside the app should pass formatAmount from
  // SettingsContext so the symbol and decimal places are correct for the currency.
  const fmtAmount = fmt ?? ((n) =>
    "$" + Math.round(n).toLocaleString("en-US")
  );

  const rem        = remaining(goal);
  const days       = daysLeft(goal.deadline);
  const monthsLeft = days / 30.44;

  if (goal.current >= goal.target) {
    return {
      monthlyNeeded: 0,
      monthsLeft: 0,
      label: "Goal reached 🎉",
      color: "var(--color-income)",
    };
  }

  if (monthsLeft <= 0) {
    return {
      monthlyNeeded: rem,
      monthsLeft: 0,
      label: "Deadline passed — update your target date",
      color: "var(--color-danger)",
    };
  }

  const monthlyNeeded = rem / monthsLeft;

  // Urgency tiers
  let color;
  let urgencyNote;
  if (monthsLeft <= 1) {
    color       = "var(--color-danger)";
    urgencyNote = "last month!";
  } else if (monthsLeft <= 3) {
    color       = "var(--color-expense)";
    urgencyNote = `${monthsLeft.toFixed(1)} mo left`;
  } else {
    color       = "var(--color-text-muted)";
    urgencyNote = `${Math.round(monthsLeft)} mo left`;
  }

  return {
    monthlyNeeded,
    monthsLeft,
    label: `${fmtAmount(monthlyNeeded)}/mo needed · ${urgencyNote}`,
    color,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. API ADAPTERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw backend savings goal into the frontend shape.
 * The backend has no `emoji` column yet — defaults to "🎯" until the model
 * is extended (add `emoji VARCHAR(10)` and a migration when auth lands).
 */
function normalizeSavingsGoal(raw) {
  return {
    id: String(raw.id),
    emoji: raw.emoji ?? "🎯",
    name: raw.goal_name, // snake_case → camelCase
    target: parseFloat(raw.target_amount),
    current: parseFloat(raw.current_amount),
    deadline: raw.deadline_date, // "2026-12-31"
  };
}

/** Build the payload the backend expects when creating or updating a goal. */
function buildGoalPayload(form) {
  return {
    goal_name: form.name.trim(),
    target_amount: parseFloat(form.target),
    current_amount: parseFloat(form.current) || 0,
    deadline_date: form.deadline,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. useSavings — PRIMARY HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useSavings() {
  // AUTH: must be first — IS_DEMO is used in the useState initialisers below
  const { isDemo: IS_DEMO } = useAuth();
  const { fetchCategories, formatAmount } = useSettings();

  const [goals, setGoals] = useState(IS_DEMO ? INITIAL_SAVINGS_GOALS : []);
  const [loading, setLoading] = useState(!IS_DEMO);
  const [error, setError] = useState(null);

  // Goal modal state
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalForm, setGoalForm] = useState(BLANK_GOAL_FORM);

  // Add-funds modal state
  const [fundsGoal, setFundsGoal] = useState(null); // goal being funded; null = closed
  const [fundsForm, setFundsForm] = useState(BLANK_FUNDS_FORM);

  // ── Fetch (live mode only) ──────────────────────────────────────────────────
  const fetchGoals = useCallback(async () => {
    if (IS_DEMO) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSavings();
      setGoals(res.data.map(normalizeSavingsGoal));
    } catch (err) {
      setError("Could not load savings goals. Is the backend running?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // ── Aggregate stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalSaved = goals.reduce((s, g) => s + g.current, 0);
    const totalTarget = goals.reduce((s, g) => s + g.target, 0);
    const complete = goals.filter((g) => g.current >= g.target).length;
    const avgPct = goals.length
      ? goals.reduce((s, g) => s + pct(g.current, g.target), 0) / goals.length
      : 0;
    return {
      totalSaved,
      totalTarget,
      complete,
      avgPct,
      total: goals.length,
    };
  }, [goals]);

  // ── Goal modal handlers ─────────────────────────────────────────────────────
  function openAdd() {
    setEditingGoal(null);
    setGoalForm(BLANK_GOAL_FORM);
    setShowGoalModal(true);
  }

  function openEdit(goal) {
    setEditingGoal(goal);
    setGoalForm({
      emoji: goal.emoji,
      name: goal.name,
      target: String(goal.target),
      current: String(goal.current),
      deadline: goal.deadline,
    });
    setShowGoalModal(true);
  }

  function closeGoalModal() {
    setShowGoalModal(false);
    setEditingGoal(null);
  }

  // ── Save goal (create or update) ────────────────────────────────────────────
  async function handleSaveGoal() {
    if (IS_DEMO) {
      const entry = {
        id: editingGoal ? editingGoal.id : uid(),
        emoji: goalForm.emoji,
        name: goalForm.name.trim(),
        target: parseFloat(goalForm.target),
        current: parseFloat(goalForm.current) || 0,
        deadline: goalForm.deadline,
      };
      if (editingGoal) {
        setGoals((prev) =>
          prev.map((g) => (g.id === editingGoal.id ? entry : g)),
        );
      } else {
        setGoals((prev) => [...prev, entry]);
      }
      closeGoalModal();
      return;
    }

    // Live mode
    try {
      const payload = buildGoalPayload(goalForm);
      if (editingGoal) {
        await updateSavingsGoal(editingGoal.id, payload);
      } else {
        await createSavingsGoal(payload);
        await fetchCategories();
      }
      await fetchGoals();
      closeGoalModal();
    } catch (err) {
      setError("Save failed. Please try again.");
      console.error(err);
    }
  }

  // ── Delete goal ─────────────────────────────────────────────────────────────
  async function handleDeleteGoal(id) {
    if (IS_DEMO) {
      setGoals((prev) => prev.filter((g) => g.id !== id));
      return;
    }
    try {
      await deleteSavingsGoal(id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      setError("Delete failed. Please try again.");
      console.error(err);
    }
  }

  // ── Add funds modal handlers ─────────────────────────────────────────────────
  function openFunds(goal) {
    setFundsGoal(goal);
    setFundsForm(BLANK_FUNDS_FORM);
  }

  function closeFunds() {
    setFundsGoal(null);
  }

  // ── Save contribution ────────────────────────────────────────────────────────
  async function handleSaveFunds() {
    const amount = parseFloat(fundsForm.amount) || 0;
    if (amount <= 0) return;

    if (IS_DEMO) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === fundsGoal.id
            ? { ...g, current: Math.min(g.current + amount, g.target * 1.5) }
            : g,
        ),
      );
      closeFunds();
      return;
    }

    // Live mode — dedicated contribute endpoint adds to current_amount server-side
    try {
      await logContribution(fundsGoal.id, amount);
      await fetchGoals();
      closeFunds();
    } catch (err) {
      setError("Could not log contribution. Please try again.");
      console.error(err);
    }
  }

  // ── Returned surface ────────────────────────────────────────────────────────
  return {
    // Data
    goals,
    loading,
    error,
    setError,

    // Aggregate stats
    stats,

    // Goal modal
    showGoalModal,
    editingGoal,
    goalForm,
    setGoalForm,
    openAdd,
    openEdit,
    closeGoalModal,
    handleSaveGoal,
    handleDeleteGoal,

    // Funds modal
    fundsGoal, // null when closed, goal object when open
    fundsForm,
    setFundsForm,
    openFunds,
    closeFunds,
    handleSaveFunds,

    formatAmount, // currency-aware (from SettingsContext)
    isDemo: IS_DEMO,
  };
}
