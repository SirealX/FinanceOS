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
  DEBT_TYPE_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
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

function DebtRow({ debt, onEdit, onDelete, onPay, onAmortization, fmt }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const paidOff = Math.max(0, debt.originalBalance - debt.balance);
  const pctDone =
    debt.originalBalance > 0
      ? Math.min((paidOff / debt.originalBalance) * 100, 100)
      : 0;
  const isZeroApr = debt.apr === 0;
  const canAmortize =
    (debt.debtType === "loan" || debt.debtType === "bnpl") && !debt.isPaidOff;
  const isPaidOff = debt.isPaidOff;

  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Top line — uses mobile CSS classes for 2-line reflow */}
      <div
        className="debt-row-top"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
        }}
      >
        {/* Avatar */}
        <div
          className="debt-row-avatar avatar"
          style={{
            background: "rgba(239,68,68,0.12)",
            color: "var(--color-danger)",
            flexShrink: 0,
          }}
        >
          {initials(debt.name)}
        </div>

        {/* Name + type */}
        <div className="debt-row-name" style={{ flex: "1 1 0", minWidth: 0 }}>
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
            <span style={{ marginRight: 6 }}>
              {debt.debtType === "credit_card"
                ? "💳 Credit Card"
                : debt.debtType === "bnpl"
                  ? "📦 BNPL"
                  : "🏦 Loan"}
            </span>
            {isPaidOff && (
              <span className="badge badge-income" style={{ fontSize: 10 }}>
                ✓ Paid Off
              </span>
            )}
          </div>
        </div>

        {/* Balance — shown on line 1 on mobile */}
        <div className="debt-row-balance" style={{ flex: "0 0 110px", textAlign: "right" }}>
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

        {/* APR + Min + Actions — group goes to line 2 on mobile via .debt-row-meta */}
        <div className="debt-row-meta">
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
              {isZeroApr ? "0%" : `${debt.apr}%`}
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
              <div
                style={{
                  fontSize: 10,
                  color: "var(--color-text-muted)",
                  marginTop: 2,
                }}
              >
                due day {debt.dueDay}
              </div>
            )}
          </div>

          {/* Actions — inside debt-row-meta so they go to line 2 on mobile */}
          <div
            style={{
              flex: "0 0 90px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 4,
              marginLeft: "auto",
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
                {!isPaidOff && (
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
                )}
                {canAmortize && (
                  <button
                    className="btn-danger"
                    title="View Amortization"
                    onClick={() => onAmortization(debt)}
                    style={{ color: "var(--color-text-muted)", fontSize: 10 }}
                  >
                    ~
                  </button>
                )}
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
        </div>{/* end debt-row-meta */}
      </div>{/* end debt-row-top */}

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
// ─────────────────────────────────────────────────────────────────────────────
// DebtModal — add / edit (supports loan, credit_card, bnpl)
// ─────────────────────────────────────────────────────────────────────────────

function DebtModal({ form, isEditing, onChange, onSave, onClose }) {
  const canSave = form.name.trim() && +form.balance > 0 && +form.minPayment > 0;
  const f = (key, val) => onChange({ ...form, [key]: val });
  const isCC = form.debtType === "credit_card";
  const isBNPL = form.debtType === "bnpl";
  const isLoan = form.debtType === "loan";

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
        style={{
          width: 540,
          maxWidth: "calc(100vw - 40px)",
          margin: 0,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
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

        {/* Debt Type */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Debt Type</label>
          <select
            className="input"
            value={form.debtType}
            onChange={(e) => f("debtType", e.target.value)}
          >
            {DEBT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Name */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Name</label>
          <input
            className="input"
            placeholder={
              isCC
                ? "e.g. AMEX Gold"
                : isLoan
                  ? "e.g. Auto Loan"
                  : "e.g. Phone BNPL"
            }
            value={form.name}
            onChange={(e) => f("name", e.target.value)}
          />
        </div>

        {/* Bank / Issuer */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Bank / Issuer (optional)</label>
          <input
            className="input"
            placeholder="e.g. Chase, Wells Fargo"
            value={form.bankName}
            onChange={(e) => f("bankName", e.target.value)}
          />
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
              onChange={(e) => f("balance", e.target.value)}
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
              onChange={(e) => f("originalBalance", e.target.value)}
            />
          </div>
        </div>

        {/* APR · Min Payment */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
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
              onChange={(e) => f("apr", e.target.value)}
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
              onChange={(e) => f("minPayment", e.target.value)}
            />
          </div>
        </div>

        {/* Due Day */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">
            Payment Due Day (optional, 1–31)
          </label>
          <input
            className="input"
            type="number"
            min="1"
            max="31"
            placeholder="e.g. 15"
            value={form.dueDay}
            onChange={(e) => f("dueDay", e.target.value)}
          />
        </div>

        {/* ── Credit Card specific ── */}
        {isCC && (
          <>
            <div
              style={{
                borderTop: "0.5px solid rgba(255,255,255,0.06)",
                margin: "12px 0 12px",
              }}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginBottom: 10,
              }}
            >
              Credit Card fields
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div className="field-wrap">
                <label className="field-label">Credit Limit ($)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.creditLimit}
                  onChange={(e) => f("creditLimit", e.target.value)}
                />
              </div>
              <div className="field-wrap">
                <label className="field-label">
                  Billing Cycle End Day (1–31)
                </label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="e.g. 28"
                  value={form.billingCycleEndDay}
                  onChange={(e) => f("billingCycleEndDay", e.target.value)}
                />
              </div>
            </div>
            <div className="field-wrap" style={{ marginBottom: 12 }}>
              <label className="field-label">Card Network</label>
              <select
                className="input"
                value={form.cardNetwork}
                onChange={(e) => f("cardNetwork", e.target.value)}
              >
                <option value="">Select…</option>
                {["Visa", "Mastercard", "Amex", "Other"].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* ── Loan specific ── */}
        {isLoan && (
          <>
            <div
              style={{
                borderTop: "0.5px solid rgba(255,255,255,0.06)",
                margin: "12px 0 12px",
              }}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginBottom: 10,
              }}
            >
              Loan fields
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div className="field-wrap">
                <label className="field-label">Term (months, optional)</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="e.g. 60"
                  value={form.termMonths}
                  onChange={(e) => f("termMonths", e.target.value)}
                />
              </div>
              <div className="field-wrap">
                <label className="field-label">Monthly Payment ($)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.paymentAmount}
                  onChange={(e) => f("paymentAmount", e.target.value)}
                />
              </div>
            </div>
            <div className="field-wrap" style={{ marginBottom: 12 }}>
              <label className="field-label">Show Amortization Schedule</label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!form.showAmortization}
                  onChange={(e) => f("showAmortization", e.target.checked)}
                />
                Enable amortization breakdown
              </label>
            </div>
          </>
        )}

        {/* ── BNPL specific ── */}
        {isBNPL && (
          <>
            <div
              style={{
                borderTop: "0.5px solid rgba(255,255,255,0.06)",
                margin: "12px 0 12px",
              }}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginBottom: 10,
              }}
            >
              Buy Now Pay Later fields
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div className="field-wrap">
                <label className="field-label">Total Installments</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="e.g. 12"
                  value={form.totalInstallments}
                  onChange={(e) => f("totalInstallments", e.target.value)}
                />
              </div>
              <div className="field-wrap">
                <label className="field-label">Installment Amount ($)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.installmentAmount}
                  onChange={(e) => f("installmentAmount", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {/* Payment type (loan + bnpl) */}
        {!isCC && (
          <>
            <div
              style={{
                borderTop: "0.5px solid rgba(255,255,255,0.06)",
                margin: "12px 0 12px",
              }}
            />
            <div className="field-wrap" style={{ marginBottom: 12 }}>
              <label className="field-label">Payment Mode</label>
              <select
                className="input"
                value={form.paymentType}
                onChange={(e) => f("paymentType", e.target.value)}
              >
                {PAYMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {form.paymentType === "auto_bank_debit" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div className="field-wrap">
                  <label className="field-label">Payment Frequency</label>
                  <select
                    className="input"
                    value={form.paymentFrequency}
                    onChange={(e) => f("paymentFrequency", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {["weekly", "biweekly", "monthly", "quarterly"].map(
                      (f_) => (
                        <option key={f_} value={f_}>
                          {f_}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="field-wrap">
                  <label className="field-label">Auto-debit Amount ($)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.paymentAmount}
                    onChange={(e) => f("paymentAmount", e.target.value)}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Start / End dates */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Start Date (optional)</label>
            <input
              className="input"
              type="date"
              value={form.startDate}
              onChange={(e) => f("startDate", e.target.value)}
            />
          </div>
          <div className="field-wrap">
            <label className="field-label">End / Payoff Date (optional)</label>
            <input
              className="input"
              type="date"
              value={form.endDate}
              onChange={(e) => f("endDate", e.target.value)}
            />
          </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// AmortizationModal — per-debt payment schedule table
// ─────────────────────────────────────────────────────────────────────────────

function AmortizationModal({ debtName, data, loading, onClose }) {
  const { formatAmount } = useSettings();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{
          width: 640,
          maxWidth: "calc(100vw - 32px)",
          margin: 0,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h2 className="section-header" style={{ margin: 0 }}>
              Amortization — {debtName}
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              Monthly principal vs interest breakdown
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

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div
              style={{
                padding: "24px 0",
                textAlign: "center",
                color: "var(--color-text-muted)",
              }}
            >
              Loading…
            </div>
          ) : !data?.schedule?.length ? (
            <div
              style={{
                padding: "24px 0",
                textAlign: "center",
                color: "var(--color-text-muted)",
              }}
            >
              No schedule available. Set term_months or payment_amount on this
              debt.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{ borderBottom: "0.5px solid rgba(255,255,255,0.1)" }}
                >
                  {[
                    "Month",
                    "Payment",
                    "Principal",
                    "Interest",
                    "Remaining",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 8px",
                        textAlign: "right",
                        color: "var(--color-text-muted)",
                        fontWeight: 500,
                        fontSize: 11,
                        "&:first-child": { textAlign: "left" },
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((row) => (
                  <tr
                    key={row.month}
                    style={{
                      borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <td
                      style={{
                        padding: "5px 8px",
                        color: "var(--color-text-muted)",
                        fontSize: 11,
                      }}
                    >
                      {row.month}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatAmount(row.payment)}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "#10B981",
                      }}
                    >
                      {formatAmount(row.principal_portion)}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: "var(--color-danger)",
                      }}
                    >
                      {formatAmount(row.interest_portion)}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        fontWeight: 500,
                      }}
                    >
                      {formatAmount(row.remaining_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
// Add PaymentModal component
function PaymentModal({ debt, onSave, onClose }) {
  const { formatAmount } = useSettings();
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

// Type label helper
const DEBT_TYPE_LABELS = {
  credit_card: "Credit Cards",
  loan: "Loans",
  bnpl: "Buy Now Pay Later",
};
const TYPE_TABS = ["all", "credit_card", "loan", "bnpl"];

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
    sliderParams,
    budgetSurplus,
    amortizationData,
    amortizationLoading,
    fetchAmortization,
    formatAmount,
    formatAmountK,
  } = useDebts();

  const { currencySymbol } = useSettings();

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [typeTab, setTypeTab] = useState("all");
  const [amortDebt, setAmortDebt] = useState(null); // debt object for amortization modal

  function openAmortization(debt) {
    setAmortDebt(debt);
    fetchAmortization(debt.id);
  }

  // Debts visible in the active tab
  const visibleDebts =
    typeTab === "all"
      ? debts
      : debts.filter((d) => (d.debtType ?? "loan") === typeTab);

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
                marginBottom: 12,
              }}
            >
              <h2 className="section-header" style={{ margin: 0 }}>
                Your Debts
              </h2>
              <span className="count-badge">{debts.length}</span>
            </div>

            {/* Type tabs */}
            <div
              className="pill-group"
              style={{ marginBottom: 12, flexWrap: "wrap", gap: 6 }}
            >
              {TYPE_TABS.map((tab) => (
                <button
                  key={tab}
                  className={`pill${typeTab === tab ? " active" : ""}`}
                  onClick={() => setTypeTab(tab)}
                >
                  {tab === "all" ? "All" : DEBT_TYPE_LABELS[tab]}
                  {tab !== "all" && (
                    <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.7 }}>
                      (
                      {
                        debts.filter((d) => (d.debtType ?? "loan") === tab)
                          .length
                      }
                      )
                    </span>
                  )}
                </button>
              ))}
            </div>

            {visibleDebts.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--color-text-muted)",
                  padding: "12px 0",
                }}
              >
                No {typeTab === "all" ? "" : DEBT_TYPE_LABELS[typeTab] + " "}
                debts found.
              </p>
            ) : (
              visibleDebts.map((debt) => (
                <DebtRow
                  key={debt.id}
                  debt={debt}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onPay={(debt) => setPayingDebt(debt)}
                  onAmortization={openAmortization}
                  fmt={formatAmount}
                />
              ))
            )}
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
                  <span>
                    {fmtSliderLabel(sliderParams.max, currencySymbol)}
                  </span>
                </div>

                {/* Budget capacity marker */}
                {budgetSurplus !== null && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      borderRadius: 7,
                      background:
                        budgetSurplus > 0
                          ? "rgba(16,185,129,0.06)"
                          : "rgba(239,68,68,0.06)",
                      border: `0.5px solid ${budgetSurplus > 0 ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {budgetSurplus > 0 ? (
                        <>
                          💡 Based on this month's cash flow, you have{" "}
                          <strong style={{ color: "var(--color-income)" }}>
                            {formatAmount(budgetSurplus)}
                          </strong>{" "}
                          available after minimums.
                        </>
                      ) : (
                        <>
                          ⚠ This month's cash flow covers minimums only — no
                          extra capacity right now.
                        </>
                      )}
                    </div>
                    {budgetSurplus > 0 && (
                      <button
                        className="btn-ghost"
                        style={{
                          fontSize: 11,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
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

              {/* Strategy comparison cards — stacks on mobile via .simulator-strategy-grid */}
              <div
                className="simulator-strategy-grid"
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
      {amortDebt && (
        <AmortizationModal
          debtName={amortDebt.name}
          data={amortizationData}
          loading={amortizationLoading}
          onClose={() => setAmortDebt(null)}
        />
      )}
    </>
  );
}
