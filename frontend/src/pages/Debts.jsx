/**
 * frontend/src/pages/Debts.jsx — Presentation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * React components only. Every value, handler, and derived datum comes from
 * useDebts() in api/Debts.js. The simulator logic lives there too.
 *
 * COMPONENTS
 *   PayoffChart     — avalanche vs snowball area-line canvas
 *   DebtRow         — single debt row with progress bar + inline confirm-delete
 *   DebtModal       — add / edit debt modal
 *   Debts           — default export, assembles all zones
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import {
  Chart,
  LineElement,
  PointElement,
  LineController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
} from "chart.js";

import {
  initials,
  monthsToLabel,
  downsample,
  DEBT_TYPES,
  useDebts,
} from "../api/Debt";

import { useSettings } from "../context/SettingsContext";

// ── Slider label formatter ────────────────────────────────────────────────────
// Formats the slider max label using compact notation for large currencies.
// Receives `sym` (the currency symbol) from the calling component.
function fmtSliderLabel(n, sym) {
  if (n >= 1_000_000) return sym + (n / 1_000_000).toFixed(0) + "M";
  if (n >= 1_000) return sym + (n / 1_000).toFixed(0) + "k";
  return sym + n.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart.js registration — once at module level
// ─────────────────────────────────────────────────────────────────────────────

Chart.register(
  LineElement,
  PointElement,
  LineController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
);

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

function IconEdit() {
  return (
    <svg
      viewBox="0 0 15 15"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.5 2.5l2 2-7 7H3.5v-2l7-7z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg
      viewBox="0 0 15 15"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3,4 12,4" />
      <path d="M5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
      <rect x="3.5" y="4" width="8" height="9" rx="1" />
      <line x1="6" y1="7" x2="6" y2="10.5" />
      <line x1="9" y1="7" x2="9" y2="10.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PayoffChart — avalanche vs snowball area lines
// ─────────────────────────────────────────────────────────────────────────────

function PayoffChart({ avalancheHistory, snowballHistory }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const { formatAmount: fmtAmount, currencySymbol } = useSettings();

  // Currency-aware compact formatter for chart axes/tooltips
  const fmtK = (n) => {
    const abs = Math.abs(n);
    if (abs >= 1_000) return currencySymbol + (abs / 1_000).toFixed(1) + "k";
    return fmtAmount(n);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    // Pad both series to the same length then downsample
    const maxLen = Math.max(avalancheHistory.length, snowballHistory.length);
    const pad = (arr) => {
      const copy = [...arr];
      while (copy.length < maxLen) copy.push(0);
      return copy;
    };

    const avData = downsample(pad(avalancheHistory));
    const snData = downsample(pad(snowballHistory));

    const labels = avData.map((_, i) => {
      const mo = Math.round(i * (maxLen / avData.length));
      if (mo === 0) return "Now";
      const y = Math.floor(mo / 12);
      const m = mo % 12;
      if (y === 0) return `${m}mo`;
      if (m === 0) return `${y}yr`;
      return `${y}yr`;
    });

    const TOOLTIP_STYLE = {
      backgroundColor: "#1E2435",
      titleColor: "#F1F5F9",
      bodyColor: "#94A3B8",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 0.5,
      padding: 10,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${fmtK(ctx.parsed.y)}`,
      },
    };

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Avalanche",
            data: avData,
            borderColor: "#EF4444",
            backgroundColor: "rgba(239,68,68,0.07)",
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
          },
          {
            label: "Snowball",
            data: snData,
            borderColor: "#F97316",
            backgroundColor: "rgba(249,115,22,0.05)",
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            borderDash: [4, 3],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: TOOLTIP_STYLE,
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.04)" },
            border: { color: "rgba(255,255,255,0.06)" },
            ticks: { color: "#5E6E85", font: { size: 10 }, maxTicksLimit: 8 },
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
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [avalancheHistory, snowballHistory]);

  return <canvas ref={canvasRef} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// DebtRow
// ─────────────────────────────────────────────────────────────────────────────

function DebtRow({ debt, onEdit, onDelete, onPay, fmt }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const paidOff = Math.max(0, debt.originalBalance - debt.balance);
  const pctDone =
    debt.originalBalance > 0
      ? Math.min((paidOff / debt.originalBalance) * 100, 100)
      : 0;
  const isZeroApr = debt.apr === 0;

  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Top line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
        }}
      >
        {/* Avatar */}
        <div
          className="avatar"
          style={{
            background: "rgba(239,68,68,0.12)",
            color: "var(--color-danger)",
            flexShrink: 0,
          }}
        >
          {initials(debt.name)}
        </div>

        {/* Name + type */}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {debt.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            {debt.type}
          </div>
        </div>

        {/* APR */}
        <div style={{ flex: "0 0 80px", textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginBottom: 3,
            }}
          >
            APR
          </div>
          <span
            className={`badge ${isZeroApr ? "badge-neutral" : "badge-expense"}`}
          >
            {isZeroApr ? "0% — interest free" : `${debt.apr}%`}
          </span>
        </div>

        {/* Min payment */}
        <div style={{ flex: "0 0 100px", textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginBottom: 3,
            }}
          >
            Min / mo
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-primary)",
            }}
          >
            {fmt(debt.minPayment)}
          </div>
          {/* #21 — due day */}
          {debt.dueDay && (
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
              due day {debt.dueDay}
            </div>
          )}
        </div>

        {/* Balance */}
        <div style={{ flex: "0 0 110px", textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginBottom: 3,
            }}
          >
            Balance
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-danger)",
              letterSpacing: "-0.3px",
            }}
          >
            {fmt(debt.balance)}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            flex: "0 0 90px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 4,
          }}
        >
          {confirmDelete ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                Remove?
              </span>
              <button
                className="btn-danger"
                style={{
                  color: "var(--color-danger)",
                  fontSize: 11,
                  padding: "2px 6px",
                }}
                onClick={() => onDelete(debt.id)}
              >
                Yes
              </button>
              <button
                className="btn-danger"
                style={{ fontSize: 11, padding: "2px 6px" }}
                onClick={() => setConfirmDelete(false)}
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                className="btn-danger"
                title="Record payment"
                onClick={() => onPay(debt)}
                style={{ color: "var(--color-income)" }}
              >
                <svg
                  viewBox="0 0 15 15"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="M2 8h11M9 4l4 4-4 4" />
                </svg>
              </button>
              <button
                className="btn-danger"
                title="Edit"
                onClick={() => onEdit(debt)}
              >
                <IconEdit />
              </button>
              <button
                className="btn-danger"
                title="Delete"
                onClick={() => setConfirmDelete(true)}
              >
                <IconDelete />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar — paid vs original */}
      <div style={{ paddingLeft: 48 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {fmt(paidOff)} paid off
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {pctDone.toFixed(0)}% of {fmt(debt.originalBalance)}
          </span>
        </div>
        <div className="progress-track budget" style={{ height: 5 }}>
          <div
            className="progress-fill"
            style={{
              width: `${pctDone}%`,
              background:
                pctDone >= 100
                  ? "var(--color-income)"
                  : "linear-gradient(90deg, rgba(239,68,68,0.6), #EF4444)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DebtModal — add / edit
// ─────────────────────────────────────────────────────────────────────────────

function DebtModal({ form, isEditing, onChange, onSave, onClose }) {
  const canSave = form.name.trim() && +form.balance > 0 && +form.minPayment > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{ width: 500, maxWidth: "calc(100vw - 40px)", margin: 0 }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h2 className="section-header" style={{ margin: 0 }}>
            {isEditing ? "Edit Debt" : "Add Debt"}
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {/* Debt Name */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Debt Name</label>
          <input
            className="input"
            placeholder="e.g. Rewards Card, Student Loan, Auto Loan"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
          />
        </div>

        {/* Type */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Type</label>
          <select
            className="input"
            value={form.type}
            onChange={(e) => onChange({ ...form, type: e.target.value })}
          >
            {DEBT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Balance · Original Balance */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Current Balance ($)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.balance}
              onChange={(e) => onChange({ ...form, balance: e.target.value })}
            />
          </div>
          <div className="field-wrap">
            <label className="field-label">Original Balance ($)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Same as current"
              value={form.originalBalance}
              onChange={(e) =>
                onChange({ ...form, originalBalance: e.target.value })
              }
            />
          </div>
        </div>

        {/* APR · Min Payment */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">APR (%)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.apr}
              onChange={(e) => onChange({ ...form, apr: e.target.value })}
            />
          </div>
          <div className="field-wrap">
            <label className="field-label">Min Monthly Payment ($)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.minPayment}
              onChange={(e) =>
                onChange({ ...form, minPayment: e.target.value })
              }
            />
          </div>
        </div>

        {/* Due day — optional, enables timely payment alerts */}
        <div className="field-wrap" style={{ marginBottom: 20 }}>
          <label className="field-label">Payment Due Day (optional)</label>
          <input
            className="input"
            type="number"
            min="1"
            max="31"
            placeholder="e.g. 15 (day of month)"
            value={form.dueDay}
            onChange={(e) => onChange({ ...form, dueDay: e.target.value })}
          />
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={onSave} disabled={!canSave}>
            {isEditing ? "Save Changes" : "Add Debt"}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
// Add PaymentModal component
function PaymentModal({ debt, onSave, onClose }) {
  const [amount, setAmount] = useState(String(debt.minPayment));
  const [method, setMethod] = useState("Bank Transfer");
  const canSave = +amount > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{ width: 400, maxWidth: "calc(100vw - 40px)", margin: 0 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <h2 className="section-header" style={{ margin: 0 }}>
              Record Payment
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              {debt.name} — balance {formatAmount(debt.balance)}
            </p>
          </div>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Payment Amount ($)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field-wrap" style={{ marginBottom: 20 }}>
          <label className="field-label">Payment Method</label>
          <select
            className="input"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {["Bank Transfer", "Credit Card", "Debit Card", "Cash"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button
            className="btn-primary"
            disabled={!canSave}
            onClick={() => onSave(parseFloat(amount), method)}
          >
            Record Payment
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Debts — default export
// ─────────────────────────────────────────────────────────────────────────────

export default function Debts() {
  const {
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
    sliderParams,  // FIX #6
    budgetSurplus, // FIX #13
    formatAmount,  // currency-aware (from SettingsContext via useDebts)
    formatAmountK, // compact currency-aware
  } = useDebts();

  const { currencySymbol } = useSettings();

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <>
      {/* ── Zone 1: Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Debt Tracker</h1>
          <p className="page-subtitle">
            Monitor balances and simulate your path to debt-free
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          + Add Debt
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* ── Zone 2: Stats Row ── */}
      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Total Debt</div>
          <div className="kpi-value danger">
            {formatAmount(stats.totalDebt)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            across {debts.length} account{debts.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Monthly Minimums</div>
          <div className="kpi-value">{formatAmount(stats.totalMin)}</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            required each month
          </div>
        </div>

        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Avg. Interest Rate</div>
          <div className="kpi-value expense">{stats.avgApr.toFixed(2)}%</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            across interest-bearing debts
          </div>
        </div>
      </div>

      {/* ── Zone 3: Debt List + Simulator ── */}
      {debts.length > 0 ? (
        <>
          {/* Debt list card */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <h2 className="section-header" style={{ margin: 0 }}>
                Your Debts
              </h2>
              <span className="count-badge">{debts.length}</span>
            </div>

            {debts.map((debt) => (
              <DebtRow
                key={debt.id}
                debt={debt}
                onEdit={openEdit}
                onDelete={handleDelete}
                onPay={(debt) => setPayingDebt(debt)}
                fmt={formatAmount}
              />
            ))}
          </div>

          {/* Payoff Simulator card */}
          {sim && (
            <div className="card" style={{ marginBottom: 0 }}>
              {/* Simulator header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 20,
                }}
              >
                <div>
                  <h2 className="section-header" style={{ margin: 0 }}>
                    Payoff Simulator
                  </h2>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      marginTop: 4,
                    }}
                  >
                    How fast can you clear your debt? Compare two strategies.
                  </p>
                </div>
                <div className="chart-legend">
                  <div className="chart-legend-item">
                    <span
                      className="cat-dot"
                      style={{ background: "#EF4444" }}
                    />
                    Avalanche
                  </div>
                  <div className="chart-legend-item" style={{ opacity: 0.7 }}>
                    <span
                      className="cat-dot"
                      style={{ background: "#F97316" }}
                    />
                    Snowball
                  </div>
                </div>
              </div>

              {/* Extra payment slider */}
              <div
                style={{
                  background: "var(--color-bg-input)",
                  borderRadius: 8,
                  padding: "14px 16px",
                  marginBottom: 20,
                  border: "0.5px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Extra monthly payment
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--color-income)",
                      letterSpacing: "-0.3px",
                    }}
                  >
                    {formatAmount(extraPmt)} / mo
                  </span>
                </div>
                <input
                  type="range"
                  min={sliderParams.min}
                  max={sliderParams.max}
                  step={sliderParams.step}
                  value={extraPmt}
                  onChange={(e) => setExtraPmt(+e.target.value)}
                  style={{
                    width: "100%",
                    appearance: "none",
                    height: 4,
                    borderRadius: 4,
                    background: `linear-gradient(90deg, #10B981 ${
                      (extraPmt / sliderParams.max) * 100
                    }%, rgba(255,255,255,0.1) ${(extraPmt / sliderParams.max) * 100}%)`,
                    outline: "none",
                    cursor: "pointer",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span>{currencySymbol}0</span>
                  <span>{fmtSliderLabel(sliderParams.max, currencySymbol)}</span>
                </div>

                {/* Budget capacity marker */}
                {budgetSurplus !== null && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      borderRadius: 7,
                      background: budgetSurplus > 0
                        ? "rgba(16,185,129,0.06)"
                        : "rgba(239,68,68,0.06)",
                      border: `0.5px solid ${budgetSurplus > 0 ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                      {budgetSurplus > 0 ? (
                        <>
                          💡 Based on this month's cash flow, you have{" "}
                          <strong style={{ color: "var(--color-income)" }}>
                            {formatAmount(budgetSurplus)}
                          </strong>{" "}
                          available after minimums.
                        </>
                      ) : (
                        <>⚠ This month's cash flow covers minimums only — no extra capacity right now.</>
                      )}
                    </div>
                    {budgetSurplus > 0 && (
                      <button
                        className="btn-ghost"
                        style={{ fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}
                        onClick={() =>
                          setExtraPmt(Math.min(budgetSurplus, sliderParams.max))
                        }
                      >
                        Use this →
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Strategy comparison cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                {/* Avalanche */}
                <div
                  style={{
                    background: "rgba(239,68,68,0.07)",
                    border: "0.5px solid rgba(239,68,68,0.2)",
                    borderRadius: 10,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      className="cat-dot"
                      style={{ background: "#EF4444", width: 8, height: 8 }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      Avalanche
                    </span>
                    {interestSaved > 0 && (
                      <span
                        className="badge badge-income"
                        style={{ marginLeft: "auto", fontSize: 10 }}
                      >
                        Best for interest
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          marginBottom: 2,
                        }}
                      >
                        Debt-free in
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          letterSpacing: "-0.5px",
                        }}
                      >
                        {monthsToLabel(sim.avalanche.months)}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          marginBottom: 2,
                        }}
                      >
                        Total interest paid
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--color-danger)",
                        }}
                      >
                        {formatAmount(sim.avalanche.totalInterest)}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.5,
                        marginTop: 2,
                        paddingTop: 8,
                        borderTop: "0.5px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      Pay minimums on all debts, then throw every extra dollar
                      at the{" "}
                      <strong style={{ color: "var(--color-text-primary)" }}>
                        highest APR
                      </strong>{" "}
                      first.
                    </div>
                  </div>
                </div>

                {/* Snowball */}
                <div
                  style={{
                    background: "rgba(249,115,22,0.06)",
                    border: "0.5px solid rgba(249,115,22,0.18)",
                    borderRadius: 10,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      className="cat-dot"
                      style={{ background: "#F97316", width: 8, height: 8 }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      Snowball
                    </span>
                    {monthsSaved > 0 && (
                      <span
                        className="badge"
                        style={{
                          marginLeft: "auto",
                          fontSize: 10,
                          background: "rgba(249,115,22,0.12)",
                          color: "#F97316",
                        }}
                      >
                        Faster wins
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          marginBottom: 2,
                        }}
                      >
                        Debt-free in
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          letterSpacing: "-0.5px",
                        }}
                      >
                        {monthsToLabel(sim.snowball.months)}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-muted)",
                          marginBottom: 2,
                        }}
                      >
                        Total interest paid
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--color-danger)",
                        }}
                      >
                        {formatAmount(sim.snowball.totalInterest)}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.5,
                        marginTop: 2,
                        paddingTop: 8,
                        borderTop: "0.5px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      Pay minimums on all debts, then attack the{" "}
                      <strong style={{ color: "var(--color-text-primary)" }}>
                        smallest balance
                      </strong>{" "}
                      first for quick wins.
                    </div>
                  </div>
                </div>
              </div>

              {/* Interest-saved callout */}
              {interestSaved > 1 && (
                <div
                  style={{
                    background: "rgba(16,185,129,0.07)",
                    border: "0.5px solid rgba(16,185,129,0.2)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "var(--color-income)", fontSize: 14 }}>
                    💡
                  </span>
                  Choosing{" "}
                  <strong style={{ color: "var(--color-income)" }}>
                    Avalanche
                  </strong>{" "}
                  over Snowball saves you{" "}
                  <strong style={{ color: "var(--color-income)" }}>
                    {formatAmount(interestSaved)}
                  </strong>{" "}
                  in interest
                  {monthsSaved > 0
                    ? ` and pays off ${monthsToLabel(monthsSaved)} faster`
                    : ""}
                  .
                </div>
              )}

              {/* Payoff chart */}
              <div className="chart-wrap debt">
                <PayoffChart
                  avalancheHistory={sim.avalanche.history}
                  snowballHistory={sim.snowball.history}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <div className="empty-title">No debts tracked yet</div>
            <div className="empty-body">
              Add your credit cards, loans, or any balance you're paying down.
            </div>
            <button className="btn-primary" onClick={openAdd}>
              + Add Debt
            </button>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {payingDebt && (
        <PaymentModal
          debt={payingDebt}
          onSave={(amount, method) => handlePay(payingDebt, amount, method)}
          onClose={() => setPayingDebt(null)}
        />
      )}
      {showModal && (
        <DebtModal
          form={form}
          isEditing={!!editingDebt}
          onChange={setForm}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </>
  );
}
