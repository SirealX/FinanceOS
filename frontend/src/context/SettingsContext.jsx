/**
 * SettingsContext.jsx — Global Settings State
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

import { CURRENCIES } from "../data/MockData";

import {
  getCategories,
  createCategory as apiCreate,
  updateCategory as apiUpdate,
  deleteCategory as apiDelete,
  getPreferences,
  updatePreferences as apiUpdatePrefs,
} from "../api/settings.axios";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  // ── Category state ──────────────────────────────────────────────────────────
  const [allCategories, setAllCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);

  // ── Preference state ────────────────────────────────────────────────────────
  const [currency, setCurrency] = useState("USD");
  const [dateFormat, setDateFormat] = useState("MMM D, YYYY");
  const [monthStart, setMonthStart] = useState(1);
  const [prefsLoading, setPrefsLoading] = useState(true);

  // ── Fetch on mount ──────────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    setCatsLoading(true);
    try {
      const res = await getCategories();
      setAllCategories(res.data);
    } catch (err) {
      console.error("SettingsContext: failed to load categories", err);
    } finally {
      setCatsLoading(false);
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const res = await getPreferences();
      const p = res.data;
      setCurrency(p.currency);
      setDateFormat(p.date_format);
      setMonthStart(p.month_start);
    } catch (err) {
      console.error("SettingsContext: failed to load preferences", err);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchPreferences();
  }, [fetchCategories, fetchPreferences]);

  // ── Derived category splits ─────────────────────────────────────────────────

  const expenseCategories = allCategories.filter((c) => c.kind === "expense");
  const incomeCategories = allCategories.filter((c) => c.kind === "income");
  const savingsCategories = allCategories.filter((c) => c.kind === "savings");

  // ── Category CRUD ───────────────────────────────────────────────────────────

  const addCategory = useCallback(async (type, { name, color }) => {
    try {
      const res = await apiCreate({ name, color, kind: type });
      setAllCategories((prev) => [...prev, res.data]);
    } catch (err) {
      console.error("addCategory failed", err);
      throw err;
    }
  }, []);

  const updateCategory = useCallback(async (type, id, patch) => {
    try {
      const res = await apiUpdate(id, patch);
      setAllCategories((prev) => prev.map((c) => (c.id === id ? res.data : c)));
    } catch (err) {
      console.error("updateCategory failed", err);
      throw err;
    }
  }, []);

  const deleteCategory = useCallback(async (type, id) => {
    try {
      await apiDelete(id);
      setAllCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("deleteCategory failed", err);
      throw err;
    }
  }, []);

  // ── Preferences ─────────────────────────────────────────────────────────────

  const updatePreferences = useCallback(async (patch) => {
    try {
      const payload = {};
      if (patch.currency !== undefined) payload.currency = patch.currency;
      if (patch.dateFormat !== undefined)
        payload.date_format = patch.dateFormat;
      if (patch.monthStart !== undefined)
        payload.month_start = patch.monthStart;

      const res = await apiUpdatePrefs(payload);
      const p = res.data;
      setCurrency(p.currency);
      setDateFormat(p.date_format);
      setMonthStart(p.month_start);
    } catch (err) {
      console.error("updatePreferences failed", err);
      throw err;
    }
  }, []);

  // ── Danger Zone ─────────────────────────────────────────────────────────────

  const clearAllTransactions = useCallback(() => {
    console.warn("clearAllTransactions: stub");
  }, []);

  const resetAllBudgets = useCallback(() => {
    console.warn("resetAllBudgets: stub");
  }, []);

  // ── Lookup helpers ──────────────────────────────────────────────────────────

  const getCategoryConfig = useCallback(
    (name) => {
      const cat = allCategories.find((c) => c.name === name);
      if (!cat) return { color: "#475569", bg: "rgba(71,85,105,0.15)" };
      return { color: cat.color, bg: cat.color + "22" };
    },
    [allCategories],
  );

  const getAllCategoryConfig = useCallback(() => {
    return Object.fromEntries(
      allCategories.map((c) => [
        c.name,
        { color: c.color, bg: c.color + "22" },
      ]),
    );
  }, [allCategories]);

  const getExpenseCategoryNames = useCallback(
    () => expenseCategories.map((c) => c.name),
    [expenseCategories],
  );
  const getIncomeCategoryNames = useCallback(
    () => incomeCategories.map((c) => c.name),
    [incomeCategories],
  );
  const getSavingsCategoryNames = useCallback(
    () => savingsCategories.map((c) => c.name),
    [savingsCategories],
  );

  // ── Currency helpers ────────────────────────────────────────────────────────

  const currencySymbol =
    CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$";
  const currencyDecimals =
    CURRENCIES.find((c) => c.code === currency)?.decimals ?? 2;

  const formatAmount = useCallback(
    (n) => {
      const info = CURRENCIES.find((c) => c.code === currency) ?? {
        symbol: "$",
        decimals: 2,
      };
      return (
        info.symbol +
        Math.abs(n).toLocaleString("en-US", {
          minimumFractionDigits: info.decimals,
          maximumFractionDigits: info.decimals,
        })
      );
    },
    [currency],
  );

  const loading = catsLoading || prefsLoading;

  const value = {
    // Raw arrays
    expenseCategories,
    incomeCategories,
    savingsCategories,
    allCategories,

    // Lookup helpers
    getCategoryConfig,
    getAllCategoryConfig,
    getExpenseCategoryNames,
    getIncomeCategoryNames,
    getSavingsCategoryNames,

    // Preferences
    currency,
    dateFormat,
    monthStart,
    currencySymbol,
    currencyDecimals,

    // Mutations
    addCategory,
    updateCategory,
    deleteCategory,
    updatePreferences,

    // Danger zone
    clearAllTransactions,
    resetAllBudgets,

    // Loading
    loading,
    fetchCategories,
    formatAmount,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettings must be called inside <SettingsProvider>");
  return ctx;
}
