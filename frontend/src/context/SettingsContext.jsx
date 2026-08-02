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

import {
  CURRENCIES,
  INITIAL_EXPENSE_CATEGORIES,
  INITIAL_INCOME_CATEGORIES,
} from "../data/MockData";

import { useAuth } from "./Authcontexts";

import {
  getCategories,
  createCategory as apiCreate,
  updateCategory as apiUpdate,
  deleteCategory as apiDelete,
  getPreferences,
  updatePreferences as apiUpdatePrefs,
  resetMyData as apiResetMyData,
} from "../api/settings.axios";

// ── Demo seed — mirrors what the backend seeds via POST /categories/seed ───────
// Each entry needs id, name, color, kind, system so getCategoryConfig() and
// every dropdown that maps over allCategories works without a live API.
const DEMO_CATEGORIES = [
  ...INITIAL_EXPENSE_CATEGORIES.map((c) => ({ ...c, kind: "expense" })),
  ...INITIAL_INCOME_CATEGORIES.map((c) => ({ ...c, kind: "income" })),
  {
    id: "sc1",
    name: "Savings",
    color: "#A78BFA",
    kind: "savings",
    system: true,
  },
];

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { isDemo: IS_DEMO, user } = useAuth();

  // ── Category state ──────────────────────────────────────────────────────────
  const [allCategories, setAllCategories] = useState(
    IS_DEMO ? DEMO_CATEGORIES : [],
  );
  const [catsLoading, setCatsLoading] = useState(!IS_DEMO);

  // ── Preference state ────────────────────────────────────────────────────────
  // Seed displayName from localStorage so the greeting shows instantly on any
  // device — the server fetch will overwrite it once it resolves.
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem("fin_display_name") || null,
  );
  const [currency, setCurrency] = useState("USD");
  const [dateFormat, setDateFormat] = useState("MMM D, YYYY");
  const [monthStart, setMonthStart] = useState(1);
  const [prefsLoading, setPrefsLoading] = useState(!IS_DEMO);

  // ── Bank balance reconciliation state ──────────────────────────────────────
  const [bankBalance, setBankBalance]               = useState(null);
  const [bankBalanceDate, setBankBalanceDate]       = useState(null);
  const [initialBalance, setInitialBalance]         = useState(null);
  const [trackingStartDate, setTrackingStartDate]   = useState(null);
  const [showBalanceGap, setShowBalanceGap]         = useState(false);
  const [balanceReminderDay, setBalanceReminderDay] = useState(null);
  const [balanceAnchorApp, setBalanceAnchorApp]     = useState(null);

  // ── Seed demo data when demo mode is activated at runtime ──────────────────
  // SettingsProvider mounts before the user enters demo mode, so useState()
  // initializers always run with isDemo = false. This effect catches the
  // false → true transition and populates the state those initializers missed.
  useEffect(() => {
    if (!IS_DEMO) return;
    setAllCategories(DEMO_CATEGORIES);
    setCatsLoading(false);
    setPrefsLoading(false);
  }, [IS_DEMO]);

  // ── Fetch on mount (live mode only) ────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    if (IS_DEMO) return;
    setCatsLoading(true);
    try {
      const res = await getCategories();
      setAllCategories(res.data);
    } catch (err) {
      console.error("SettingsContext: failed to load categories", err);
    } finally {
      setCatsLoading(false);
    }
  }, [IS_DEMO]);

  const fetchPreferences = useCallback(async () => {
    if (IS_DEMO) return;
    setPrefsLoading(true);
    try {
      const res = await getPreferences();
      const p = res.data;
      // Server is the source of truth — update state and cache locally so the
      // greeting shows the correct name instantly on the next device/load.
      const name = p.display_name ?? null;
      setDisplayName(name);
      if (name) localStorage.setItem("fin_display_name", name);
      else       localStorage.removeItem("fin_display_name");
      setCurrency(p.currency);
      setDateFormat(p.date_format);
      setMonthStart(p.month_start);
      // Bank balance reconciliation
      setBankBalance(p.bank_balance ?? null);
      setBankBalanceDate(p.bank_balance_date ?? null);
      setInitialBalance(p.initial_balance ?? null);
      setTrackingStartDate(p.tracking_start_date ?? null);
      setShowBalanceGap(p.show_balance_gap ?? false);
      setBalanceReminderDay(p.balance_reminder_day ?? null);
      setBalanceAnchorApp(p.balance_anchor_app ?? null);
    } catch (err) {
      // Non-fatal: we already seeded from localStorage, so the greeting still
      // shows the last-known name.
      console.error("SettingsContext: failed to load preferences", err);
    } finally {
      setPrefsLoading(false);
    }
  }, [IS_DEMO]);

  // Only fetch once we have a confirmed authenticated user.
  // Without this guard, SettingsContext fires API calls during the invite flow
  // before any session exists, causing a flood of 401 errors.
  useEffect(() => {
    if (IS_DEMO || !user) return;
    fetchCategories();
    fetchPreferences();
  }, [IS_DEMO, user, fetchCategories, fetchPreferences]);

  // ── Derived category splits ─────────────────────────────────────────────────

  const expenseCategories = allCategories.filter((c) => c.kind === "expense");
  const incomeCategories = allCategories.filter((c) => c.kind === "income");
  const savingsCategories = allCategories.filter((c) => c.kind === "savings");

  // ── Category CRUD ───────────────────────────────────────────────────────────

  const addCategory = useCallback(
    async (type, { name, color }) => {
      if (IS_DEMO) {
        const newCat = {
          id: `demo-${Date.now()}`,
          name,
          color,
          kind: type,
          system: false,
        };
        setAllCategories((prev) => [...prev, newCat]);
        return;
      }
      try {
        const res = await apiCreate({ name, color, kind: type });
        setAllCategories((prev) => [...prev, res.data]);
      } catch (err) {
        console.error("addCategory failed", err);
        throw err;
      }
    },
    [IS_DEMO],
  );

  const updateCategory = useCallback(
    async (type, id, patch) => {
      if (IS_DEMO) {
        setAllCategories((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        );
        return;
      }
      try {
        const res = await apiUpdate(id, patch);
        setAllCategories((prev) =>
          prev.map((c) => (c.id === id ? res.data : c)),
        );
      } catch (err) {
        console.error("updateCategory failed", err);
        throw err;
      }
    },
    [IS_DEMO],
  );

  const deleteCategory = useCallback(
    async (type, id) => {
      if (IS_DEMO) {
        setAllCategories((prev) => prev.filter((c) => c.id !== id));
        return;
      }
      try {
        await apiDelete(id);
        setAllCategories((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        console.error("deleteCategory failed", err);
        throw err;
      }
    },
    [IS_DEMO],
  );

  // ── Preferences ─────────────────────────────────────────────────────────────

  const updatePreferences = useCallback(
    async (patch) => {
      if (IS_DEMO) {
        if (patch.displayName !== undefined) setDisplayName(patch.displayName || null);
        if (patch.currency    !== undefined) setCurrency(patch.currency);
        if (patch.dateFormat  !== undefined) setDateFormat(patch.dateFormat);
        if (patch.monthStart  !== undefined) setMonthStart(patch.monthStart);
        return;
      }
      try {
        const payload = {};
        if (patch.displayName !== undefined) payload.display_name = patch.displayName;
        if (patch.currency    !== undefined) payload.currency     = patch.currency;
        if (patch.dateFormat  !== undefined) payload.date_format  = patch.dateFormat;
        if (patch.monthStart  !== undefined) payload.month_start  = patch.monthStart;
        // Bank balance fields
        if (patch.bankBalance         !== undefined) payload.bank_balance         = patch.bankBalance;
        if (patch.bankBalanceDate     !== undefined) payload.bank_balance_date    = patch.bankBalanceDate;
        if (patch.initialBalance      !== undefined) payload.initial_balance      = patch.initialBalance;
        if (patch.trackingStartDate   !== undefined) payload.tracking_start_date  = patch.trackingStartDate;
        if (patch.showBalanceGap      !== undefined) payload.show_balance_gap     = patch.showBalanceGap;
        if ("balanceReminderDay" in patch)           payload.balance_reminder_day = patch.balanceReminderDay;
        if (patch.balanceAnchorApp    !== undefined) payload.balance_anchor_app   = patch.balanceAnchorApp;

        const res = await apiUpdatePrefs(payload);
        const p = res.data;
        const savedName = p.display_name ?? null;
        setDisplayName(savedName);
        // Keep the cache in sync so other devices benefit on next load.
        if (savedName) localStorage.setItem("fin_display_name", savedName);
        else           localStorage.removeItem("fin_display_name");
        setCurrency(p.currency);
        setDateFormat(p.date_format);
        setMonthStart(p.month_start);
        // Sync bank balance state
        setBankBalance(p.bank_balance ?? null);
        setBankBalanceDate(p.bank_balance_date ?? null);
        setInitialBalance(p.initial_balance ?? null);
        setTrackingStartDate(p.tracking_start_date ?? null);
        setShowBalanceGap(p.show_balance_gap ?? false);
        setBalanceReminderDay(p.balance_reminder_day ?? null);
        setBalanceAnchorApp(p.balance_anchor_app ?? null);
      } catch (err) {
        console.error("updatePreferences failed", err);
        throw err;
      }
    },
    [IS_DEMO],
  );

  // ── Danger Zone ─────────────────────────────────────────────────────────────

  // NOTE: these two are pre-existing stubs (never wired up, console.warn only)
  // — left as-is, fixing them wasn't part of this pass. Only resetMyData below
  // is real. Worth eventually either wiring these for real or removing the
  // buttons — a "Danger Zone" button that silently does nothing is worse than
  // not having it.
  const clearAllTransactions = useCallback(() => {
    console.warn("clearAllTransactions: stub");
  }, []);

  const resetAllBudgets = useCallback(() => {
    console.warn("resetAllBudgets: stub");
  }, []);

  // Wipes this user's transactions/bills/debts/savings/budget/alerts/
  // recurring/earmarked via POST /account/reset. Keeps login, Preferences,
  // AlertPreferences, and categories — see Backend/app/routers/account.py.
  // Full page reload afterward so every context (Transactions, Bills, Debts,
  // Savings, Budget, Alerts, Dashboard) refetches fresh/empty from the API
  // instead of needing each one's local state manually cleared here.
  const resetMyData = useCallback(async () => {
    if (IS_DEMO) {
      console.warn("resetMyData: no-op in demo mode");
      return;
    }
    try {
      const res = await apiResetMyData();
      console.info("resetMyData: deleted", res.data.deleted);
      window.location.reload();
    } catch (err) {
      console.error("resetMyData failed", err);
      throw err;
    }
  }, [IS_DEMO]);

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
    displayName,   // null = not set; string = user's chosen name
    currency,
    dateFormat,
    monthStart,
    currencySymbol,
    currencyDecimals,

    // Bank balance reconciliation
    bankBalance,
    bankBalanceDate,
    initialBalance,
    trackingStartDate,
    showBalanceGap,
    balanceReminderDay,
    balanceAnchorApp,

    // Mutations
    addCategory,
    updateCategory,
    deleteCategory,
    updatePreferences,

    // Danger zone
    clearAllTransactions,
    resetAllBudgets,
    resetMyData,

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
