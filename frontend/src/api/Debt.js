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
import { getDebts, getCreditCards, createDebt, updateDebt, deleteDebt, payDebt, getAmortization } from "./debts";
import { useSettings } from "../context/SettingsContext";
import client from "./client";

// ── Re-exports ────────────────────────────────────────────────────────────────

export { DEBT_TYPES };

// ── Constants ─────────────────────────────────────────────────────────────────

export const SIM_MAX_MONTHS = 360;

// How often min_payment_frequency actually bills per year, /12 for "how much
// of this happens in an average month." Mirrors
// Backend/app/services/payment_utils.py's monthly_equivalent() exactly --
// keep both in sync if this ever changes.
const PAYMENTS_PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4 };

export const MIN_PAYMENT_FREQUENCY_OPTIONS = ["weekly", "biweekly", "monthly", "quarterly"];

/**
 * Convert a per-period payment amount into its monthly equivalent.
 * Unknown/missing frequency defaults to "monthly" (a no-op conversion), same
 * reasoning as the backend helper.
 */
export function monthlyEquivalent(amount, frequency) {
  const periodsPerYear = PAYMENTS_PER_YEAR[frequency] ?? 12;
  return (Number(amount) || 0) * periodsPerYear / 12;
}

// Debt type options for the form dropdown
export const DEBT_TYPE_OPTIONS = [
  { value: "loan",        label: "Loan" },
  { value: "credit_card", label: "Credit Card" },
  { value: "bnpl",        label: "Buy Now Pay Later" },
];

// Payment type options
export const PAYMENT_TYPE_OPTIONS = [
  { value: "manual",            label: "Manual" },
  { value: "auto_bank_debit",   label: "Auto Bank Debit" },
  { value: "payroll_deduction", label: "Payroll Deduction" },
];

export const BLANK_FORM = {
  name: "",
  debtType: "loan",              // 'loan' | 'credit_card' | 'bnpl'
  balance: "",
  originalBalance: "",
  apr: "",
  minPayment: "",
  minPaymentFrequency: "monthly", // 'weekly' | 'biweekly' | 'monthly' | 'quarterly' -- how min_payment is actually billed
  dueDay: "",
  bankName: "",
  paymentType: "manual",         // 'manual' | 'auto_bank_debit' | 'payroll_deduction'
  paymentFrequency: "",          // 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
  paymentAmount: "",
  startDate: "",
  endDate: "",
  // Credit card
  creditLimit: "",
  billingCycleEndDay: "",
  cardNetwork: "",
  // Loan
  showAmortization: false,
  termMonths: "",
  // BNPL
  linkedTransactionId: "",
  totalInstallments: "",
  installmentAmount: "",
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

/**
 * @deprecated BUG-15 — hardcodes "$". Consumers should use `formatAmount`
 * from `useSettings()` (returned by `useDebts()` as `formatAmount`) so the
 * correct currency symbol and decimal rules are applied.
 */
export function formatAmount(n) {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * @deprecated BUG-15 — hardcodes "$". Use `formatAmountK` returned by
 * `useDebts()` which is built from the currency-aware `currencySymbol`.
 */
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
    // minPayment is entered exactly as billed (weekly/biweekly/monthly/
    // quarterly), not pre-converted -- everything below needs a MONTHLY
    // figure, so convert once up front rather than re-deriving it every
    // iteration of the while loop.
    const d = debts.map((x) => ({
      ...x,
      balance: +x.balance,
      minPaymentMonthly: monthlyEquivalent(x.minPayment, x.minPaymentFrequency),
    }));
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
            x.balance - Math.min(x.minPaymentMonthly, x.balance),
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
    id:                    String(raw.id),
    name:                  raw.name,
    debtType:              raw.type ?? "loan",
    balance:               parseFloat(raw.balance),
    originalBalance:       parseFloat(raw.original_balance ?? raw.balance),
    apr:                   parseFloat(raw.interest_rate),
    minPayment:            parseFloat(raw.min_payment),
    minPaymentFrequency:   raw.min_payment_frequency ?? "monthly",
    priority:              raw.priority_rank ?? 1,
    dueDay:                raw.due_day ?? null,
    bankName:              raw.bank_name ?? null,
    isPaidOff:             raw.is_paid_off ?? false,
    paymentType:           raw.payment_type ?? "manual",
    paymentFrequency:      raw.payment_frequency ?? null,
    paymentAmount:         raw.payment_amount ? parseFloat(raw.payment_amount) : null,
    startDate:             raw.start_date ?? null,
    endDate:               raw.end_date ?? null,
    showAmortization:      raw.show_amortization ?? false,
    termMonths:            raw.term_months ?? null,
    creditLimit:           raw.credit_limit ? parseFloat(raw.credit_limit) : null,
    billingCycleEndDay:    raw.billing_cycle_end_day ?? null,
    cardNetwork:           raw.card_network ?? null,
    linkedTransactionId:   raw.linked_transaction_id ?? null,
    totalInstallments:     raw.total_installments ?? null,
    installmentsPaid:      raw.installments_paid ?? 0,
    installmentAmount:     raw.installment_amount ? parseFloat(raw.installment_amount) : null,
    recurringTransactionId: raw.recurring_transaction_id ?? null,
  };
}

function buildPayload(form, existingDebt) {
  const bal     = parseFloat(form.balance);
  const origBal = parseFloat(form.originalBalance);
  const dueDay  = parseInt(form.dueDay, 10);

  const payload = {
    name:             form.name.trim(),
    balance:          bal,
    original_balance: !isNaN(origBal) ? Math.max(origBal, bal) : bal,
    interest_rate:    parseFloat(form.apr) || 0,
    min_payment:      parseFloat(form.minPayment) || 0,
    min_payment_frequency: form.minPaymentFrequency || "monthly",
    priority_rank:    existingDebt ? existingDebt.priority : 999,
    due_day:          !isNaN(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : null,
    // New fields
    type:             form.debtType || "loan",
    bank_name:        form.bankName?.trim() || null,
    payment_type:     form.paymentType || "manual",
    payment_frequency: form.paymentFrequency || null,
    payment_amount:   parseFloat(form.paymentAmount) || null,
    start_date:       form.startDate || null,
    end_date:         form.endDate || null,
    show_amortization: form.showAmortization || false,
    term_months:      parseInt(form.termMonths, 10) || null,
  };

  // Credit card fields
  if (form.debtType === "credit_card") {
    payload.credit_limit          = parseFloat(form.creditLimit) || null;
    payload.billing_cycle_end_day = parseInt(form.billingCycleEndDay, 10) || null;
    payload.card_network          = form.cardNetwork?.trim() || null;
  }

  // BNPL fields
  if (form.debtType === "bnpl") {
    payload.linked_transaction_id = form.linkedTransactionId || null;
    payload.total_installments    = parseInt(form.totalInstallments, 10) || null;
    payload.installment_amount    = parseFloat(form.installmentAmount) || null;
  }

  return payload;
}

// ── useDebts — PRIMARY HOOK ───────────────────────────────────────────────────

export function useDebts() {
  const { isDemo: IS_DEMO } = useAuth();
  const { currency, formatAmount, currencySymbol } = useSettings();

  // Currency-aware compact formatter — used for chart ticks/tooltips and row labels
  const formatAmountKCurrency = useCallback(
    (n) => {
      const abs = Math.abs(n);
      if (abs >= 1_000) return currencySymbol + (abs / 1_000).toFixed(1) + "k";
      return formatAmount(n);
    },
    [currencySymbol, formatAmount],
  );

  const [debts, setDebts] = useState(IS_DEMO ? INITIAL_DEBTS : []);
  const [creditCards, setCreditCards] = useState([]);  // active CC debts for dropdown
  const [loading, setLoading] = useState(!IS_DEMO);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [extraPmt, setExtraPmt] = useState(0);
  const [payingDebt, setPayingDebt] = useState(null);
  const [budgetSurplus, setBudgetSurplus] = useState(null);
  const [amortizationData, setAmortizationData] = useState(null);
  const [amortizationLoading, setAmortizationLoading] = useState(false);

  // FIX #6: slider params derived from current currency setting
  const sliderParams = useMemo(() => getSliderParams(currency), [currency]);

  const fetchDebts = useCallback(async () => {
    if (IS_DEMO) return;
    setLoading(true);
    setError(null);
    try {
      const [debtsRes, summaryRes, ccRes] = await Promise.all([
        getDebts(),
        client.get("/summary?period=this_month").catch(() => null),
        getCreditCards().catch(() => ({ data: [] })),
      ]);
      const loaded = debtsRes.data.map(normalizeDebt);
      setDebts(loaded);
      setCreditCards((ccRes.data || []).map(normalizeDebt));

      if (summaryRes) {
        const liquidNet  = summaryRes.data.liquid_net ?? 0;
        const totalMin   = loaded.reduce((s, d) => s + d.minPayment, 0);
        const available  = Math.max(0, Math.round(liquidNet - totalMin));
        setBudgetSurplus(available);
      }
    } catch (err) {
      setError("Could not load debts. Is the backend running?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAmortization = useCallback(async (debtId) => {
    setAmortizationLoading(true);
    setAmortizationData(null);
    try {
      const res = await getAmortization(debtId);
      setAmortizationData(res.data);
    } catch (err) {
      setError("Could not load amortization schedule.");
      console.error(err);
    } finally {
      setAmortizationLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDebts();
  }, [fetchDebts]);

  const stats = useMemo(() => {
    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
    const totalMin = debts.reduce(
      (s, d) => s + monthlyEquivalent(d.minPayment, d.minPaymentFrequency),
      0,
    );
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

  // Flags debts whose minimum payment doesn't even cover the interest that
  // accrues on them each month. Mathematically, at $0 extra those balances
  // grow instead of shrink no matter how long you wait -- simulate() reflects
  // that faithfully (that's why "$0 extra" can show 30+ years / a huge total
  // interest and an upward-curving chart), but without this called out
  // explicitly it just looks like the simulator is broken. Purely
  // informational -- doesn't change the simulation itself.
  //
  // Compares against the MONTHLY EQUIVALENT of min_payment, not the raw
  // entered figure -- a biweekly-billed debt's real monthly payment is
  // ~2.17x the number on the Debts tab, and comparing the raw (smaller)
  // number against monthly interest is exactly what made a healthy loan
  // look like it was in negative amortization (2026-08-02 bug).
  const negativeAmortizationDebts = useMemo(() => {
    return debts
      .filter((d) => {
        if (d.isPaidOff || d.balance <= 0) return false;
        const monthlyInterest = d.balance * (d.apr / 100 / 12);
        const minPaymentMonthly = monthlyEquivalent(d.minPayment, d.minPaymentFrequency);
        return minPaymentMonthly < monthlyInterest;
      })
      .map((d) => ({
        ...d,
        minPaymentMonthly: monthlyEquivalent(d.minPayment, d.minPaymentFrequency),
      }));
  }, [debts]);

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
      name:               debt.name,
      debtType:           debt.debtType ?? "loan",
      balance:            String(debt.balance),
      originalBalance:    String(debt.originalBalance),
      apr:                String(debt.apr),
      minPayment:         String(debt.minPayment),
      minPaymentFrequency: debt.minPaymentFrequency ?? "monthly",
      dueDay:             debt.dueDay != null ? String(debt.dueDay) : "",
      bankName:           debt.bankName ?? "",
      paymentType:        debt.paymentType ?? "manual",
      paymentFrequency:   debt.paymentFrequency ?? "",
      paymentAmount:      debt.paymentAmount != null ? String(debt.paymentAmount) : "",
      startDate:          debt.startDate ?? "",
      endDate:            debt.endDate ?? "",
      creditLimit:        debt.creditLimit != null ? String(debt.creditLimit) : "",
      billingCycleEndDay: debt.billingCycleEndDay != null ? String(debt.billingCycleEndDay) : "",
      cardNetwork:        debt.cardNetwork ?? "",
      showAmortization:   debt.showAmortization ?? false,
      termMonths:         debt.termMonths != null ? String(debt.termMonths) : "",
      linkedTransactionId: debt.linkedTransactionId ?? "",
      totalInstallments:  debt.totalInstallments != null ? String(debt.totalInstallments) : "",
      installmentAmount:  debt.installmentAmount != null ? String(debt.installmentAmount) : "",
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
      const parsedDay = parseInt(form.dueDay, 10);
      const entry = {
        id: editingDebt ? editingDebt.id : uid(),
        name: form.name.trim(),
        debtType: form.debtType || "loan",
        balance: bal,
        originalBalance: Math.max(origBal, bal),
        apr: parseFloat(form.apr) || 0,
        minPayment: parseFloat(form.minPayment),
        priority: editingDebt ? editingDebt.priority : debts.length + 1,
        dueDay: !isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : null,
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
    // BUG-11 fix: call fetchDebts() for a full server-side refresh instead of
    // local state mutation.  This ensures creditCards and budgetSurplus are
    // also updated — they depend on the full debt list from the server.
    try {
      await deleteDebt(id);
      await fetchDebts();
    } catch (err) {
      setError("Delete failed. Please try again.");
      console.error(err);
    }
  }

  return {
    debts,
    creditCards,
    loading,
    error,
    setError,
    sim,
    extraPmt,
    setExtraPmt,
    interestSaved,
    monthsSaved,
    negativeAmortizationDebts,
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
    sliderParams,
    budgetSurplus,
    amortizationData,
    amortizationLoading,
    fetchAmortization,
    fetchDebts,
    formatAmount,
    formatAmountK: formatAmountKCurrency,
    isDemo: IS_DEMO,
  };
}
