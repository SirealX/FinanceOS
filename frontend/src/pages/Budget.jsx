/**
 * frontend/src/pages/Budget.jsx — Presentation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Tab switcher: All | Expenses | Income | Savings
 * All tab  → 3 KPI summary cards + grouped overview bar chart + grouped rows
 * Other tabs → filtered planned vs actual view
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import {
  Chart,
  BarElement,
  BarController,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";

import {
  PERIOD_OPTIONS,
  BUDGET_TABS,
  getBudgetChartConfig,
  getAllTabChartConfig,
  useBudget,
} from "../api/Budget";

Chart.register(BarElement, BarController, CategoryScale, LinearScale, Tooltip);

// ── Chart canvas wrapper ──────────────────────────────────────────────────────
// FIX #9: Animation is disabled in both chart configs (duration: 0), so
// destroy/recreate is now instant — no flicker on tab switch or period change.
// The previous in-place update approach had a stale-closure bug that made it
// fire on every render anyway.

function BudgetChart({ rows, config, fmtK }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const resolvedConfig = config ?? (rows ? getBudgetChartConfig(rows, fmtK) : null);

  useEffect(() => {
    if (!canvasRef.current || !resolvedConfig) return;

    // Destroy previous instance then create fresh — instant since animation: 0
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    chartRef.current = new Chart(canvasRef.current, resolvedConfig);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [resolvedConfig]);

  return <canvas ref={canvasRef} />;
}

// ── Progress Row (single category) ───────────────────────────────────────────

function ProgressRow({ name, color, scaledPlanned, actual, kind, fmt, is_active }) {
  const isActive = is_active !== false; // treat undefined as active
  const pct =
    scaledPlanned > 0 ? Math.min((actual / scaledPlanned) * 100, 100) : 0;
  const over = actual > scaledPlanned && scaledPlanned > 0;

  // For income: "over" is actually good (earned more than planned)
  const isIncome = kind === "income";
  const barColor = over && !isIncome ? "var(--color-danger)" : color;
  const amountColor =
    over && !isIncome ? "var(--color-danger)" : "var(--color-text-primary)";

  return (
    <div style={{ marginBottom: 16, opacity: isActive ? 1 : 0.4, transition: "opacity 0.2s" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
            {name}
          </span>
          {!isActive && (
            <span className="badge badge-neutral" style={{ fontSize: 10 }}>
              Inactive
            </span>
          )}
          {isActive && over && !isIncome && (
            <span className="badge badge-expense" style={{ fontSize: 10 }}>
              Over budget
            </span>
          )}
          {isActive && over && isIncome && (
            <span className="badge badge-income" style={{ fontSize: 10 }}>
              Exceeded target
            </span>
          )}
          {isActive && actual === 0 && (
            <span className="badge badge-neutral" style={{ fontSize: 10 }}>
              No activity
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: amountColor }}>
            {fmt(actual)}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            / {fmt(scaledPlanned)}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              minWidth: 36,
              textAlign: "right",
              color: amountColor,
            }}
          >
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="progress-track budget">
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            background: barColor,
            transition: "width 0.35s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── All-tab KPI card ──────────────────────────────────────────────────────────

function KindSummaryCard({ label, stats, color, icon, fmt }) {
  const pct = stats.overallPct.toFixed(0);
  return (
    <div className="card card-compact" style={{ marginBottom: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <span className="kpi-label">{label}</span>
        <span style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div className="kpi-value" style={{ color }}>
        {fmt(stats.totalActual)}
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="progress-track budget">
          <div
            className="progress-fill"
            style={{
              width: `${pct}%`,
              background: color,
              transition: "width 0.35s ease",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            marginTop: 4,
          }}
        >
          {pct}% of {fmt(stats.totalPlanned)} planned ·{" "}
          {stats.remaining > 0
            ? `${fmt(stats.remaining)} remaining`
            : "at or over target"}
        </div>
      </div>
    </div>
  );
}

// ── Set Budget Modal ──────────────────────────────────────────────────────────

function BudgetModal({ allCategories, budgetTab, saving, onSave, onClose, fmt }) {
  // Only edit the categories relevant to the current tab
  // On the All tab, edit all three kinds
  const toEdit = allCategories
    .filter((c) => budgetTab === "all" || c.kind === budgetTab)
    .map((c) => ({ ...c, _input: String(c.planned ?? 0) }));

  const [draft, setDraft] = useState(toEdit);

  function handleChange(i, val) {
    setDraft((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, _input: val } : c)),
    );
  }

  function handleToggleActive(i) {
    setDraft((prev) =>
      prev.map((c, idx) =>
        idx === i ? { ...c, is_active: !(c.is_active !== false) } : c,
      ),
    );
  }

  function handleSave() {
    const updated = draft.map((c) => ({
      ...c,
      planned: parseFloat(c._input) || 0,
    }));
    onSave(updated);
  }

  const totalPlanned = draft.reduce(
    (s, c) => s + (parseFloat(c._input) || 0),
    0,
  );

  // Group by kind for display
  const groups = [
    { kind: "expense", label: "Expenses", color: "var(--color-expense)" },
    { kind: "income", label: "Income", color: "var(--color-income)" },
    { kind: "savings", label: "Savings", color: "var(--color-savings)" },
  ].filter((g) => budgetTab === "all" || g.kind === budgetTab);

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
          width: 520,
          maxWidth: "calc(100vw - 40px)",
          margin: 0,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <div>
            <h2 className="section-header" style={{ margin: 0 }}>
              Set Monthly Budget
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              Planned amounts apply per month
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

        {/* Total preview */}
        <div
          style={{
            background: "var(--color-bg-input)",
            border: "0.5px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Total planned budget
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.3px",
            }}
          >
            {fmt(totalPlanned)}
          </span>
        </div>

        {/* Grouped inputs */}
        {groups.map(({ kind, label, color }) => {
          const kindDraft = draft.filter((c) => c.kind === kind);
          if (kindDraft.length === 0) return null;
          return (
            <div key={kind} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                {kindDraft.map((c) => {
                  const i = draft.indexOf(c);
                  const isActive = c.is_active !== false;
                  return (
                    <div
                      key={c.name}
                      className="field-wrap"
                      style={{ opacity: isActive ? 1 : 0.5, transition: "opacity 0.2s" }}
                    >
                      <label
                        className="field-label"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: c.color,
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name}
                          </span>
                        </span>
                        {/* Active / Inactive toggle */}
                        <button
                          type="button"
                          title={isActive ? "Click to deactivate" : "Click to activate"}
                          onClick={() => handleToggleActive(i)}
                          style={{
                            flexShrink: 0,
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: "0.4px",
                            textTransform: "uppercase",
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: "none",
                            cursor: "pointer",
                            background: isActive
                              ? "rgba(16,185,129,0.15)"
                              : "rgba(100,116,139,0.15)",
                            color: isActive
                              ? "var(--color-income)"
                              : "var(--color-text-muted)",
                            lineHeight: 1.6,
                          }}
                        >
                          {isActive ? "ON" : "OFF"}
                        </button>
                      </label>
                      <div style={{ position: "relative" }}>
                        <span
                          style={{
                            position: "absolute",
                            left: 10,
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: 13,
                            color: "var(--color-text-muted)",
                            pointerEvents: "none",
                          }}
                        >
                          $
                        </span>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={c._input}
                          onChange={(e) => handleChange(i, e.target.value)}
                          style={{ paddingLeft: 22 }}
                          disabled={(c.system && kind === "savings") || !isActive}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="form-actions">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Budget"}
          </button>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget — default export ───────────────────────────────────────────────────

export default function Budget() {
  const {
    expenseRows,
    incomeRows,
    savingsRows,
    expenseStats,
    incomeStats,
    savingsStats,
    activeRows,
    activeStats,
    allCategories,
    budgetTab,
    setBudgetTab,
    period,
    setPeriod,
    loading,
    error,
    setError,
    saving,
    showModal,
    openModal,
    closeModal,
    handleSave,
    formatAmount,   // currency-aware (from SettingsContext via useBudget)
    formatAmountK,  // compact currency-aware
  } = useBudget();

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 380, borderRadius: 12 }} />
      </div>
    );
  }

  const isAllTab = budgetTab === "all";

  // Chart config for the All tab overview — pass currency-aware fmtK
  const allTabChartConfig = isAllTab
    ? getAllTabChartConfig(expenseRows, incomeRows, savingsRows, formatAmountK)
    : null;

  // For single-kind tabs, show stats from the active kind
  const stats = activeStats;

  // Kind color for single-tab views
  const kindColor =
    budgetTab === "income"
      ? "var(--color-income)"
      : budgetTab === "savings"
        ? "var(--color-savings)"
        : "var(--color-expense)";

  return (
    <>
      {/* ── Zone 1: Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Budget</h1>
          <p className="page-subtitle">
            Plan and track spending, income, and savings
          </p>
        </div>
        <div className="page-header-actions">
          {/* Period selector */}
          <div className="pill-group">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p}
                className={`pill${period === p ? " active" : ""}`}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={openModal}>
            Set Budget
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* ── Budget tab switcher ── */}
      <div
        className="pill-group"
        style={{ marginBottom: 14, width: "fit-content" }}
      >
        {BUDGET_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`pill${budgetTab === tab.id ? " active" : ""}`}
            onClick={() => setBudgetTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════
          ALL TAB — Option B layout
          ════════════════════════════════════════ */}
      {isAllTab && (
        <>
          {/* 3 KPI summary cards */}
          <div className="grid-stats" style={{ marginBottom: 14 }}>
            <KindSummaryCard
              label="EXPENSES"
              stats={expenseStats}
              color="var(--color-expense)"
              icon="💳"
              fmt={formatAmount}
            />
            <KindSummaryCard
              label="INCOME"
              stats={incomeStats}
              color="var(--color-income)"
              icon="💵"
              fmt={formatAmount}
            />
            <KindSummaryCard
              label="SAVINGS"
              stats={savingsStats}
              color="var(--color-savings)"
              icon="🎯"
              fmt={formatAmount}
            />
          </div>

          {/* Planned surplus / deficit banner */}
          {(() => {
            const plannedSurplus =
              incomeStats.totalPlanned -
              expenseStats.totalPlanned -
              savingsStats.totalPlanned;
            const isPositive = plannedSurplus >= 0;
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: isPositive
                    ? "rgba(16,185,129,0.06)"
                    : "rgba(239,68,68,0.06)",
                  border: `0.5px solid ${isPositive ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}`,
                  borderRadius: 10,
                  padding: "10px 16px",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>{isPositive ? "✅" : "⚠️"}</span>
                  <span>
                    Planned budget:{" "}
                    <span style={{ color: "var(--color-income)" }}>
                      {formatAmount(incomeStats.totalPlanned)}
                    </span>{" "}
                    income &minus;{" "}
                    <span style={{ color: "var(--color-expense)" }}>
                      {formatAmount(expenseStats.totalPlanned)}
                    </span>{" "}
                    expenses &minus;{" "}
                    <span style={{ color: "var(--color-savings)" }}>
                      {formatAmount(savingsStats.totalPlanned)}
                    </span>{" "}
                    savings
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "-0.3px",
                    color: isPositive
                      ? "var(--color-income)"
                      : "var(--color-danger)",
                    whiteSpace: "nowrap",
                    marginLeft: 16,
                  }}
                >
                  {isPositive ? "+" : "−"}
                  {formatAmount(Math.abs(plannedSurplus))}{" "}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    planned {isPositive ? "surplus" : "deficit"}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Overview bar chart */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h2 className="section-header" style={{ margin: 0 }}>
                Overview
              </h2>
              <div className="chart-legend">
                {[
                  { label: "Planned", color: "rgba(255,255,255,0.2)" },
                  { label: "Actual", color: "var(--color-income)" },
                ].map(({ label, color }) => (
                  <div key={label} className="chart-legend-item">
                    <span
                      style={{
                        display: "inline-block",
                        width: 20,
                        height: 8,
                        borderRadius: 3,
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-wrap bar">
              <BudgetChart config={allTabChartConfig} />
            </div>
          </div>

          {/* Grouped rows — Expenses */}
          {expenseRows.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <h2 className="section-header" style={{ margin: 0 }}>
                  Expenses
                </h2>
                <span className="count-badge">{expenseRows.length}</span>
              </div>
              {expenseRows.map((row) => (
                <ProgressRow
                  key={row.name}
                  {...row}
                  actual={row.actual}
                  kind="expense"
                  fmt={formatAmount}
                />
              ))}
            </div>
          )}

          {/* Grouped rows — Income */}
          {incomeRows.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <h2 className="section-header" style={{ margin: 0 }}>
                  Income
                </h2>
                <span className="count-badge">{incomeRows.length}</span>
              </div>
              {incomeRows.map((row) => (
                <ProgressRow
                  key={row.name}
                  {...row}
                  actual={row.actual}
                  kind="income"
                  fmt={formatAmount}
                />
              ))}
            </div>
          )}

          {/* Grouped rows — Savings */}
          {savingsRows.length > 0 && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <h2 className="section-header" style={{ margin: 0 }}>
                  Savings
                </h2>
                <span className="count-badge">{savingsRows.length}</span>
              </div>
              {savingsRows.map((row) => (
                <ProgressRow
                  key={row.name}
                  {...row}
                  actual={row.actual}
                  kind="savings"
                  fmt={formatAmount}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════
          SINGLE-KIND TABS — detailed view
          ════════════════════════════════════════ */}
      {!isAllTab && stats && (
        <>
          {/* Stats row */}
          <div className="grid-stats" style={{ marginBottom: 14 }}>
            <div className="card card-compact" style={{ marginBottom: 0 }}>
              <div className="kpi-label">Total Planned</div>
              <div className="kpi-value">
                {formatAmount(stats.totalPlanned)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  marginTop: 8,
                }}
              >
                {period.toLowerCase()}
              </div>
            </div>
            <div className="card card-compact" style={{ marginBottom: 0 }}>
              <div className="kpi-label">
                {budgetTab === "income" ? "Total Earned" : "Total Spent"}
              </div>
              <div className="kpi-value" style={{ color: kindColor }}>
                {formatAmount(stats.totalActual)}
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="progress-track budget">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${stats.overallPct}%`,
                      background:
                        stats.overallPct >= 100 && budgetTab !== "income"
                          ? "var(--color-danger)"
                          : kindColor,
                      transition: "width 0.35s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                    marginTop: 4,
                  }}
                >
                  {stats.overallPct.toFixed(0)}% of budget ·{" "}
                  {formatAmount(stats.remaining)} remaining
                </div>
              </div>
            </div>
            <div className="card card-compact" style={{ marginBottom: 0 }}>
              <div className="kpi-label">
                {budgetTab === "income" ? "Targets Exceeded" : "Over Budget"}
              </div>
              <div
                className="kpi-value"
                style={{
                  color:
                    stats.overCount > 0
                      ? budgetTab === "income"
                        ? "var(--color-income)"
                        : "var(--color-danger)"
                      : kindColor,
                }}
              >
                {stats.overCount}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  marginTop: 8,
                }}
              >
                {stats.overCount === 0
                  ? budgetTab === "income"
                    ? "All below income target"
                    : "All categories within budget 🎉"
                  : `categor${stats.overCount === 1 ? "y" : "ies"}`}
              </div>
            </div>
          </div>

          {/* Chart + progress rows */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h2 className="section-header" style={{ margin: 0 }}>
                Planned vs Actual
              </h2>
              <div className="chart-legend">
                <div className="chart-legend-item">
                  <span
                    style={{
                      display: "inline-block",
                      width: 20,
                      height: 8,
                      borderRadius: 3,
                      background: "rgba(255,255,255,0.12)",
                      flexShrink: 0,
                    }}
                  />
                  Planned
                </div>
                <div className="chart-legend-item">
                  <span
                    style={{
                      display: "inline-block",
                      width: 20,
                      height: 8,
                      borderRadius: 3,
                      background: kindColor,
                      flexShrink: 0,
                    }}
                  />
                  Actual
                </div>
              </div>
            </div>

            {activeRows.length > 0 ? (
              <>
                <div className="chart-wrap bar" style={{ marginBottom: 28 }}>
                  <BudgetChart rows={activeRows} fmtK={formatAmountK} />
                </div>
                <div
                  style={{
                    borderTop: "0.5px solid rgba(255,255,255,0.06)",
                    marginBottom: 20,
                  }}
                />
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    margin: "0 0 16px",
                  }}
                >
                  By Category
                </h3>
                {activeRows.map((row) => (
                  <ProgressRow
                    key={row.name}
                    {...row}
                    actual={row.actual}
                    kind={budgetTab}
                    fmt={formatAmount}
                  />
                ))}
              </>
            ) : (
              <div className="empty-state" style={{ paddingTop: 32 }}>
                <div className="empty-icon">📊</div>
                <div className="empty-title">No budget set yet</div>
                <div className="empty-body">
                  Click "Set Budget" to define your planned amounts.
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Set Budget Modal ── */}
      {showModal && (
        <BudgetModal
          allCategories={allCategories}
          budgetTab={budgetTab}
          saving={saving}
          onSave={handleSave}
          onClose={closeModal}
          fmt={formatAmount}
        />
      )}
    </>
  );
}
