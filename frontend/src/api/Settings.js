/**
 * api/Settings.js — Settings Logic Layer
 */

import { useState, useEffect } from "react";
import client from "./client";
import { useSettings } from "../context/SettingsContext";
import {
  CURRENCIES,
  DATE_FORMATS,
  MONTH_START_OPTIONS,
  COLOR_SWATCHES,
} from "../data/MockData";

// ── Re-exports ────────────────────────────────────────────────────────────────

export { CURRENCIES, DATE_FORMATS, MONTH_START_OPTIONS, COLOR_SWATCHES };

// ── Constants ─────────────────────────────────────────────────────────────────

export const BLANK_CATEGORY = { name: "", color: "#6366F1" };

/** Four tabs — All and Savings do not allow adding new categories. */
export const CAT_TABS = [
  { id: "all", label: "All", canAdd: false },
  { id: "expense", label: "Expense", canAdd: true },
  { id: "income", label: "Income", canAdd: true },
  { id: "savings", label: "Savings", canAdd: false },
];

export const DANGER_ACTIONS = [
  {
    id: "clearTransactions",
    label: "Clear All Transactions",
    description: "Permanently removes every transaction from the database.",
  },
  {
    id: "resetBudgets",
    label: "Reset All Budgets",
    description: "Sets all planned budget amounts back to zero.",
  },
  {
    id: "resetMyData",
    label: "Reset My Data",
    description:
      "Wipes all your transactions, bills, debts, savings goals, budget history, recurring templates, and alerts — like a fresh account, ready to use. Keeps your login, currency/date settings, and categories.",
  },
];

// ── Pure formatters ───────────────────────────────────────────────────────────

export function formatAmountPreview(currencyCode) {
  const symbol = CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? "$";
  return symbol + "1,234.56";
}

export function formatDatePreview(format) {
  const PREVIEWS = {
    "MM/DD/YYYY": "04/14/2026",
    "DD/MM/YYYY": "14/04/2026",
    "YYYY-MM-DD": "2026-04-14",
    "MMM D, YYYY": "Apr 14, 2026",
  };
  return PREVIEWS[format] ?? "Apr 14, 2026";
}

export function formatMonthStartLabel(day) {
  if (day === 1) return "1st of each month";
  if (day === 2) return "2nd of each month";
  if (day === 3) return "3rd of each month";
  if (day === 15) return "15th (mid-month)";
  return `${day}th of each month`;
}

export function hexToRgba(hex, opacity = 0.13) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

// ── Validators ────────────────────────────────────────────────────────────────

export function validateCategoryName(name, existingCats, editingId = null) {
  const trimmed = name.trim();
  if (!trimmed)
    return { valid: false, error: "Category name cannot be empty." };

  const duplicate = existingCats.some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== editingId,
  );
  if (duplicate) return { valid: false, error: `"${trimmed}" already exists.` };

  return { valid: true, error: null };
}

// Export and import are handled by ExportModal and ImportWizard components.
// See: frontend/src/components/ExportModal.jsx
//      frontend/src/pages/ImportWizard.jsx

// ── useSettingsPage ───────────────────────────────────────────────────────────

export function useSettingsPage() {
  const settings = useSettings();

  const [catTab, setCatTab] = useState("all");
  const [catModal, setCatModal] = useState(null);
  const [saved, setSaved] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState(settings.displayName ?? "");
  const [draftCurrency, setDraftCurrency] = useState(settings.currency);
  const [draftDateFormat, setDraftDateFormat] = useState(settings.dateFormat);
  const [draftMonthStart, setDraftMonthStart] = useState(settings.monthStart);
  const [dangerPending, setDangerPending] = useState(null);

  // ── Bank balance draft state ───────────────────────────────────────────────
  const [draftBankBalance,       setDraftBankBalance]       = useState(settings.bankBalance       ?? "");
  const [draftBankBalanceDate,   setDraftBankBalanceDate]   = useState(settings.bankBalanceDate   ?? "");
  const [draftInitialBalance,    setDraftInitialBalance]    = useState(settings.initialBalance    ?? "");
  const [draftTrackingStartDate, setDraftTrackingStartDate] = useState(settings.trackingStartDate ?? "");
  const [draftShowGap,           setDraftShowGap]           = useState(settings.showBalanceGap    ?? false);
  const [draftReminderDay,       setDraftReminderDay]       = useState(settings.balanceReminderDay ?? "");
  const [balanceSaved,           setBalanceSaved]           = useState(false);

  // ── Live summary for the reconciliation preview and anchor capture ─────────
  const [settingsSummary, setSettingsSummary] = useState(null);
  useEffect(() => {
    client.get("/summary?period=this_month")
      .then((r) => setSettingsSummary(r.data))
      .catch(() => {});
  }, []);

  // ── Active category list based on selected tab ─────────────────────────────
  const activeCats = (() => {
    if (catTab === "expense") return settings.expenseCategories;
    if (catTab === "income") return settings.incomeCategories;
    if (catTab === "savings") return settings.savingsCategories;
    return settings.allCategories; // "all"
  })();

  // Whether the current tab allows adding new categories
  const currentTab = CAT_TABS.find((t) => t.id === catTab);
  const canAddOnTab = currentTab?.canAdd ?? false;

  // ── Preferences ───────────────────────────────────────────────────────────

  async function handleSavePreferences() {
    try {
      await settings.updatePreferences({
        displayName: draftDisplayName.trim() || null,
        currency:    draftCurrency,
        dateFormat:  draftDateFormat,
        monthStart:  draftMonthStart,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2_500);
    } catch (err) {
      console.error("handleSavePreferences failed", err);
    }
  }

  // ── Bank balance handler ──────────────────────────────────────────────────

  async function handleSaveBankBalance() {
    try {
      const patch = {
        showBalanceGap:     draftShowGap,
        balanceReminderDay: draftReminderDay === "" ? null : parseInt(draftReminderDay, 10),
      };
      if (draftBankBalance       !== "") patch.bankBalance       = parseFloat(draftBankBalance);
      if (draftBankBalanceDate   !== "") patch.bankBalanceDate   = draftBankBalanceDate;
      if (draftInitialBalance    !== "") patch.initialBalance    = parseFloat(draftInitialBalance);
      if (draftTrackingStartDate !== "") patch.trackingStartDate = draftTrackingStartDate;

      // Capture the app's current running balance as the projection anchor.
      // The dashboard will then compute:
      //   projected_bank = bank_balance + (current_closing - balance_anchor_app)
      // so the displayed balance auto-updates as new transactions are logged.
      //
      // IMPORTANT: always set this when saving bankBalance — even if summary
      // hasn't loaded yet (default to 0). Without the anchor the dashboard
      // can only show a static value and never reflects new transactions.
      if (draftBankBalance !== "") {
        patch.balanceAnchorApp = settingsSummary?.closing_balance ?? 0;
      }

      await settings.updatePreferences(patch);
      setBalanceSaved(true);
      setTimeout(() => setBalanceSaved(false), 2_500);
    } catch (err) {
      console.error("handleSaveBankBalance failed", err);
    }
  }

  // ── Category handlers ──────────────────────────────────────────────────────

  function openAddCat() {
    if (!canAddOnTab) return;
    setCatModal({ mode: "add", initial: { ...BLANK_CATEGORY }, type: catTab });
  }

  function openEditCat(cat) {
    // Determine which list this category belongs to for the modal type
    const type = cat.kind ?? catTab;
    setCatModal({ mode: "edit", initial: { ...cat }, type });
  }

  async function handleSaveCat(form) {
    const existingCats =
      catModal.type === "expense"
        ? settings.expenseCategories
        : catModal.type === "income"
          ? settings.incomeCategories
          : settings.savingsCategories;

    const editingId = catModal.mode === "edit" ? form.id : null;
    const { valid, error } = validateCategoryName(
      form.name,
      existingCats,
      editingId,
    );

    if (!valid) return { error };

    try {
      if (catModal.mode === "add") {
        await settings.addCategory(catModal.type, {
          name: form.name,
          color: form.color,
        });
      } else {
        await settings.updateCategory(catModal.type, form.id, {
          name: form.name.trim(),
          color: form.color,
        });
      }
      setCatModal(null);
      return { error: null };
    } catch (err) {
      const detail =
        err?.response?.data?.detail ?? "Save failed. Please try again.";
      return { error: detail };
    }
  }

  async function handleDeleteCat(id) {
    try {
      await settings.deleteCategory(catTab, id);
    } catch (err) {
      console.error(
        "handleDeleteCat:",
        err?.response?.data?.detail ?? "Delete failed.",
      );
    }
  }

  // ── Danger Zone ────────────────────────────────────────────────────────────

  function requestDangerAction(id) {
    setDangerPending(id);
  }
  function confirmDangerAction() {
    if (dangerPending === "clearTransactions") settings.clearAllTransactions();
    if (dangerPending === "resetBudgets") settings.resetAllBudgets();
    if (dangerPending === "resetMyData") {
      // Not awaited deliberately — resetMyData() reloads the page on success,
      // which unmounts everything anyway. setDangerPending(null) below still
      // runs first so the "Are you sure?" state doesn't linger if it fails
      // fast, but a full error UI isn't worth building for a page that's
      // about to reload.
      settings.resetMyData().catch(() => {
        alert("Reset failed. Please try again, or check the console for details.");
      });
    }
    setDangerPending(null);
  }
  function cancelDangerAction() {
    setDangerPending(null);
  }

  // ── Derived previews ───────────────────────────────────────────────────────

  const amountPreview = formatAmountPreview(draftCurrency);
  const datePreview = formatDatePreview(draftDateFormat);
  const monthStartPreview = formatMonthStartLabel(draftMonthStart);

  return {
    // Context pass-through
    expenseCategories: settings.expenseCategories,
    incomeCategories: settings.incomeCategories,
    savingsCategories: settings.savingsCategories,
    getCategoryConfig: settings.getCategoryConfig,

    // Local UI state
    catTab,
    setCatTab,
    catModal,
    setCatModal,
    activeCats,
    canAddOnTab, // ← true only on Expense and Income tabs
    saved,

    // Draft preferences
    draftDisplayName,
    setDraftDisplayName,
    draftCurrency,
    setDraftCurrency,
    draftDateFormat,
    setDraftDateFormat,
    draftMonthStart,
    setDraftMonthStart,

    // Bank balance
    draftBankBalance,       setDraftBankBalance,
    draftBankBalanceDate,   setDraftBankBalanceDate,
    draftInitialBalance,    setDraftInitialBalance,
    draftTrackingStartDate, setDraftTrackingStartDate,
    draftShowGap,           setDraftShowGap,
    draftReminderDay,       setDraftReminderDay,
    balanceSaved,
    settingsSummary,      // live /summary data — used for reconciliation preview
    handleSaveBankBalance,

    // Danger zone
    dangerPending,

    // Computed previews
    amountPreview,
    datePreview,
    monthStartPreview,

    // Handlers
    handleSavePreferences,
    openAddCat,
    openEditCat,
    handleSaveCat,
    handleDeleteCat,
    requestDangerAction,
    confirmDangerAction,
    cancelDangerAction,
  };
}
