/**
 * Dashboard.jsx — Presentation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * React components only. Every value comes from useDashboard() in Dashboard.js.
 *
 * COMPONENTS
 *   KpiCard        — stat card with delta indicator
 *   OverviewChart  — cash-flow line chart canvas
 *   ExpenseDonut   — expense breakdown doughnut canvas
 *   BudgetRow      — category progress bar row
 *   TxRow          — recent transaction row
 *
 * DEFAULT EXPORT  Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";
import {
  Chart,
  LineElement,
  PointElement,
  LineController,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
} from "chart.js";

import { formatAmountK, useDashboard, formatAmount } from "../api/Dshboard";

// ─────────────────────────────────────────────────────────────────────────────
// Chart.js registration — once at module level
// ─────────────────────────────────────────────────────────────────────────────

Chart.register(
  LineElement,
  PointElement,
  LineController,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
);

// ─────────────────────────────────────────────────────────────────────────────
// KpiCard
// ─────────────────────────────────────────────────────────────────────────────

// accent: "positive" | "negative" | undefined — adds a subtle background tint
// so the balance card is unambiguous at a glance even before reading the number.
function KpiCard({ label, value, delta, colorClass, icon, accent, subtitle }) {
  const isUp = delta.dir === "up";

  const accentStyle =
    accent === "positive"
      ? {
          background: "rgba(16,185,129,0.07)",
          border: "0.5px solid rgba(16,185,129,0.18)",
        }
      : accent === "negative"
        ? {
            background: "rgba(239,68,68,0.07)",
            border: "0.5px solid rgba(239,68,68,0.18)",
          }
        : {};

  return (
    <div
      className="card card-compact"
      style={{ marginBottom: 0, ...accentStyle }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <span className="kpi-label">{label}</span>
        <span style={{ color: "var(--color-text-hint)", opacity: 0.6 }}>
          {icon}
        </span>
      </div>
      <div className={`kpi-value ${colorClass}`}>{value}</div>
      {subtitle && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginTop: 4,
          }}
        >
          {subtitle}
        </div>
      )}
      <div className="kpi-delta" style={{ marginTop: 8 }}>
        <span className={isUp ? "arrow-up" : "arrow-down"}>
          {isUp ? "▲" : "▼"} {delta.pct}%
        </span>
        <span className="vs-label">vs last month</span>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// BalanceCard
//
// Two modes depending on whether a bank balance has been set in Settings:
//
//  WITH bank balance (primary mode):
//    Primary headline  — bank balance + "as of [date]"
//    Row 1             — start of month (opening)
//    Row 2             — app's current calculated balance ("Gap") + month delta
//
//  WITHOUT bank balance (fallback mode, original behaviour):
//    Primary headline  — opening balance
//    Row               — "Now" (closing) + month delta
// ─────────────────────────────────────────────────────────────────────────────

function BalanceCard({ opening, closing, delta, icon, bankBalance, bankBalanceDate }) {
  const monthChange  = closing - opening;
  const isUp         = delta.dir === "up";
  const hasBankData  = bankBalance !== null && bankBalance !== undefined;

  // Accent tint: green if the headline number is positive, red otherwise
  const headlinePositive = hasBankData ? bankBalance >= 0 : opening >= 0;
  const accentStyle = headlinePositive
    ? { background: "rgba(16,185,129,0.07)", border: "0.5px solid rgba(16,185,129,0.18)" }
    : { background: "rgba(239,68,68,0.07)",  border: "0.5px solid rgba(239,68,68,0.18)"  };

  const fmt = (n) =>
    (n >= 0 ? "+" : "−") + "$" +
    Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtAbs = (n) =>
    "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Format the bank balance date as "Apr 24"
  const bankDateLabel = bankBalanceDate
    ? new Date(bankBalanceDate + "T00:00:00").toLocaleString("en-US", { month: "short", day: "numeric" })
    : null;

  const divider = (
    <div style={{ height: "0.5px", background: "rgba(255,255,255,0.08)", margin: "10px 0 8px" }} />
  );

  const smallRow = (label, value, isPositive, suffix) => (
    <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span>
        <span style={{ fontWeight: 600, color: isPositive ? "var(--color-income)" : "var(--color-expense)" }}>
          {fmt(value)}
        </span>
        {suffix && (
          <span style={{ marginLeft: 6, color: "var(--color-text-muted)", fontSize: 11 }}>
            {suffix}
          </span>
        )}
      </span>
    </div>
  );

  return (
    <div className="card card-compact" style={{ marginBottom: 0, ...accentStyle }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span className="kpi-label">BALANCE</span>
        <span style={{ color: "var(--color-text-hint)", opacity: 0.6 }}>{icon}</span>
      </div>

      {hasBankData ? (
        <>
          {/* ── Mode A: bank balance as headline ── */}
          <div className={`kpi-value ${bankBalance >= 0 ? "income" : "expense"}`}>
            {fmt(bankBalance)}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
            {bankDateLabel ? `as of ${bankDateLabel} · current bank balance` : "current bank balance"}
          </div>

          {divider}

          {smallRow(
            "start of month",
            opening,
            opening >= 0,
            opening >= 0 ? "you started this month ahead" : "you started this month in the red",
          )}
          {smallRow(
            "Gap",
            closing,
            closing >= 0,
            `(${monthChange >= 0 ? "+" : "−"}${fmtAbs(monthChange)} this month)`,
          )}
        </>
      ) : (
        <>
          {/* ── Mode B: opening as headline (original behaviour) ── */}
          <div className={`kpi-value ${opening >= 0 ? "income" : "expense"}`}>
            {fmt(opening)}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
            {opening >= 0 ? "you started this month ahead" : "you started this month in the red"}
          </div>

          {divider}

          {smallRow(
            "Now",
            closing,
            closing >= 0,
            `(${monthChange >= 0 ? "+" : "−"}${fmtAbs(monthChange)} this month)`,
          )}
        </>
      )}

      {/* Delta vs last month */}
      <div className="kpi-delta" style={{ marginTop: 8 }}>
        <span className={isUp ? "arrow-up" : "arrow-down"}>
          {isUp ? "▲" : "▼"} {delta.pct}%
        </span>
        <span className="vs-label">vs last month's start</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Icons (tiny SVGs, co-located with KpiCard)
// ─────────────────────────────────────────────────────────────────────────────

const iconProps = {
  viewBox: "0 0 15 15",
  width: 15,
  height: 15,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const NetBalanceIcon = () => (
  <svg {...iconProps}>
    <path d="M2 10 L7.5 4 L13 10" />
  </svg>
);
const IncomeIcon = () => (
  <svg {...iconProps}>
    <path d="M7.5 2v11M4 6l3.5-4L11 6" />
  </svg>
);
const ExpenseIcon = () => (
  <svg {...iconProps}>
    <path d="M7.5 13V2M4 9l3.5 4L11 9" />
  </svg>
);
const SavingsIcon = () => (
  <svg {...iconProps} strokeWidth={1.6}>
    <circle cx="7.5" cy="7.5" r="5.5" />
    <circle cx="7.5" cy="7.5" r="2" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// OverviewChart — cash-flow line chart
// Mounts / destroys the Chart.js instance; config comes from Dashboard.js.
// ─────────────────────────────────────────────────────────────────────────────

function OverviewChart({ config }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !config) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    chartRef.current = new Chart(canvasRef.current, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [config]);

  return <canvas ref={canvasRef} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpenseDonut — expense breakdown doughnut
// ─────────────────────────────────────────────────────────────────────────────

function ExpenseDonut({ config }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !config) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    chartRef.current = new Chart(canvasRef.current, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [config]);

  return <canvas ref={canvasRef} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// BudgetRow
// ─────────────────────────────────────────────────────────────────────────────

function BudgetRow({ category, color, spent, planned }) {
  const pct = Math.min((spent / planned) * 100, 100);
  const over = spent > planned;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="cat-dot" style={{ background: color }} />
          <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
            {category}
          </span>
          {over && (
            <span className="badge badge-expense" style={{ fontSize: 10 }}>
              Over
            </span>
          )}
        </div>
        <div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: over
                ? "var(--color-expense)"
                : "var(--color-text-primary)",
            }}
          >
            {formatAmount(spent)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginLeft: 4,
            }}
          >
            / {formatAmount(planned)}
          </span>
        </div>
      </div>
      <div className="progress-track budget">
        <div
          className={`progress-fill${over ? " over-budget" : ""}`}
          style={{ width: `${pct}%`, background: over ? undefined : color }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TxRow
// ─────────────────────────────────────────────────────────────────────────────

function TxRow({ tx }) {
  const isIncome = tx.type === "income";
  return (
    <div className="tx-row">
      <div className="tx-col-avatar">
        <div
          className="avatar"
          style={{ background: tx.avatarBg, color: tx.avatarColor }}
        >
          {tx.initials}
        </div>
      </div>
      <div className="tx-col-desc">
        <div className="tx-name">{tx.name}</div>
        <div className="tx-meta">{tx.method}</div>
      </div>
      <div
        className="tx-col-cat"
        style={{ fontSize: 12, color: "var(--color-text-muted)" }}
      >
        {tx.category}
      </div>
      <div className="tx-col-date tx-date">{tx.date}</div>
      <div className="tx-col-amount">
        <span className={`tx-amount ${tx.type}`}>
          {isIncome ? "+" : "−"}
          {formatAmount(tx.amount)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — default export
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    period,
    setPeriod,
    periodOptions,
    periodSubtitle,
    user,
    kpi,
    donutLegend,
    budgetRows,
    recentTransactions,
    overviewChartConfig,
    donutChartConfig,
    loading,
    slowLoad,
    error,
    showBalanceGap,
    bankBalance,
    bankBalanceDate,
    initialBalance,
    goToBudget,
    goToTransactions,
  } = useDashboard();

  // Loading skeleton while API fetches complete
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Waking-up hint — only appears after 2.5 s on slow cold starts */}
        {slowLoad && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: 10,
              background: "rgba(99,102,241,0.08)",
              border: "0.5px solid rgba(99,102,241,0.2)",
              fontSize: 13,
              color: "var(--color-text-secondary)",
            }}
          >
            <span style={{ fontSize: 16 }}>☕</span>
            <span>
              Waking up the server — this only happens after a period of
              inactivity. Should be ready in a few seconds.
            </span>
          </div>
        )}
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 12,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 100, borderRadius: 12 }}
            />
          ))}
        </div>
        <div className="skeleton" style={{ height: 260, borderRadius: 12 }} />
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* error banner */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ══ ZONE 1: Page Header ══ */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Hello, {user.name} 👋</h1>
          <p className="page-subtitle">
            Here's your financial summary for {periodSubtitle}
          </p>
        </div>
        <div className="pill-group">
          {periodOptions.map((p) => (
            <button
              key={p}
              className={`pill${period === p ? " active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ══ ZONE 2: KPI Cards ══ */}
      <div className="grid-kpi" style={{ marginBottom: 12 }}>
        {/* BALANCE / NET SAVED
            ─ Single-month views: show the closing balance with a tint so
              positive vs negative is immediately obvious.
            ─ Last 3 Months: closing balance has no single meaningful start
              point, so show cumulative Net Saved instead.
        */}
        {period === "Last 3 Months" ? (
          <KpiCard
            label="NET SAVED"
            value={
              (kpi.netBalance >= 0 ? "+" : "−") +
              formatAmount(Math.abs(kpi.netBalance))
            }
            delta={kpi.netDelta}
            colorClass={kpi.netBalance >= 0 ? "income" : "expense"}
            accent={kpi.netBalance >= 0 ? "positive" : "negative"}
            subtitle="income − expenses over 3 months"
            icon={<NetBalanceIcon />}
          />
        ) : (
          <BalanceCard
            opening={kpi.openingBalance}
            closing={kpi.closingBalance}
            delta={kpi.openingDelta}
            icon={<NetBalanceIcon />}
            bankBalance={bankBalance}
            bankBalanceDate={bankBalanceDate}
          />
        )}
        <KpiCard
          label="INCOME"
          value={formatAmount(kpi.income)}
          delta={kpi.incomeDelta}
          colorClass="income"
          icon={<IncomeIcon />}
        />
        <KpiCard
          label="EXPENSES"
          value={formatAmount(kpi.expenses)}
          delta={kpi.expensesDelta}
          colorClass="expense"
          icon={<ExpenseIcon />}
        />
        <KpiCard
          label="SAVINGS RATE"
          value={`${kpi.savingsRate.toFixed(1)}%`}
          delta={kpi.savingsDelta}
          colorClass="savings"
          icon={<SavingsIcon />}
        />
      </div>

      {/* ══ ZONE 3a: Cash Flow + Expense Donut ══ */}
      <div className="grid-chart-secondary" style={{ marginBottom: 12 }}>
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
              Cash Flow
            </h2>
            <div className="chart-legend">
              <div className="chart-legend-item">
                <span className="cat-dot" style={{ background: "#10B981" }} />
                Income
              </div>
              <div className="chart-legend-item">
                <span className="cat-dot" style={{ background: "#F97316" }} />
                Expenses
              </div>
            </div>
          </div>
          <div className="chart-wrap line">
            <OverviewChart config={overviewChartConfig} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2 className="section-header">Expense Breakdown</h2>
          <div className="chart-wrap donut" style={{ marginBottom: 16 }}>
            <ExpenseDonut config={donutChartConfig} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {donutLegend.map(({ label, color, value, pct }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="cat-dot" style={{ background: color }} />
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {label}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{ fontSize: 11, color: "var(--color-text-muted)" }}
                  >
                    {pct}%
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                      minWidth: 60,
                      textAlign: "right",
                    }}
                  >
                    {formatAmountK(value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ ZONE 3b: Budget Progress + Recent Transactions ══ */}
      <div className="grid-two-col" style={{ marginBottom: 0 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            <h2 className="section-header" style={{ margin: 0 }}>
              Budget Progress
            </h2>
            <button className="btn-ghost" onClick={goToBudget}>
              View all →
            </button>
          </div>
          {budgetRows.length > 0 ? (
            budgetRows.map((row) => <BudgetRow key={row.category} {...row} />)
          ) : (
            <div
              style={{
                fontSize: 13,
                color: "var(--color-text-muted)",
                padding: "24px 0",
                textAlign: "center",
              }}
            >
              No budget set yet —{" "}
              <button className="btn-ghost" onClick={() => {}}>
                Set one up
              </button>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h2 className="section-header" style={{ margin: 0 }}>
              Recent Transactions
            </h2>
            <button className="btn-ghost" onClick={goToTransactions}>
              View all →
            </button>
          </div>

          <div
            className="tx-row tx-header-row"
            style={{ paddingTop: 0, marginBottom: 2 }}
          >
            <div className="tx-col-avatar" />
            <div className="tx-col-desc  col-header">Description</div>
            <div className="tx-col-cat   col-header">Category</div>
            <div className="tx-col-date  col-header">Date</div>
            <div
              className="tx-col-amount col-header"
              style={{ textAlign: "right" }}
            >
              Amount
            </div>
          </div>

          {recentTransactions.length > 0 ? (
            recentTransactions.map((tx) => <TxRow key={tx.id} tx={tx} />)
          ) : (
            <div
              style={{
                fontSize: 13,
                color: "var(--color-text-muted)",
                padding: "24px 0",
                textAlign: "center",
              }}
            >
              No transactions yet this period.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
