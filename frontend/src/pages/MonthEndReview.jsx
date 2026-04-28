/**
 * MonthEndReview.jsx — Month-End Review Page (#25)
 * ─────────────────────────────────────────────────────────────────────────────
 * A read-only financial report card for a completed month.
 * Shows: cash flow summary, budget category scorecard, bills status,
 * debt snapshot, and auto-generated insights.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { REVIEW_PERIODS, useMonthEndReview } from "../api/MonthEndReview";

// ── Score Ring — circular SVG progress indicator ──────────────────────────────

function ScoreRing({ pct, size = 72, stroke = 6, color = "var(--color-income)" }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
      <text
        x="50%" y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="var(--color-text-primary)"
        fontSize={size * 0.22}
        fontWeight="700"
      >
        {pct}%
      </text>
    </svg>
  );
}

// ── Category row in the budget scorecard ──────────────────────────────────────

function CategoryScoreRow({ name, color, planned, actual, fmt }) {
  const pct   = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
  const over  = planned > 0 && actual > planned;
  const empty = planned === 0;
  const barColor = over ? "var(--color-danger)" : color;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{name}</span>
          {over && (
            <span className="badge badge-expense" style={{ fontSize: 10 }}>Over</span>
          )}
          {!over && !empty && actual === 0 && (
            <span className="badge badge-neutral" style={{ fontSize: 10 }}>No spend</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: over ? "var(--color-danger)" : "var(--color-text-primary)" }}>
            {fmt(actual)}
          </span>
          {planned > 0 && (
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>/ {fmt(planned)}</span>
          )}
        </div>
      </div>
      {!empty && (
        <div className="progress-track budget">
          <div
            className="progress-fill"
            style={{ width: `${pct}%`, background: barColor, transition: "width 0.4s ease" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Insight chip ─────────────────────────────────────────────────────────────

function InsightChip({ type, text }) {
  const isWin = type === "win";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        background: isWin ? "rgba(16,185,129,0.06)" : "rgba(249,115,22,0.06)",
        border: `0.5px solid ${isWin ? "rgba(16,185,129,0.18)" : "rgba(249,115,22,0.18)"}`,
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
        {isWin ? "✅" : "⚠️"}
      </span>
      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        {text}
      </span>
    </div>
  );
}

// ── Summary KPI card ──────────────────────────────────────────────────────────

function SummaryKpi({ label, value, color, sub }) {
  return (
    <div className="card card-compact" style={{ marginBottom: 0 }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── MonthEndReview — default export ──────────────────────────────────────────

export default function MonthEndReview() {
  const {
    period,
    setPeriod,
    loading,
    error,
    setError,
    summary,
    categories,
    bills,
    debt,
    insights,
    budgetScore,
    formatAmount,
    formatAmountK,
    isDemo,
  } = useMonthEndReview();

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    );
  }

  const net       = summary?.net ?? 0;
  const netColor  = net >= 0 ? "var(--color-income)" : "var(--color-danger)";
  const netSign   = net >= 0 ? "+" : "−";
  const scoreColor =
    budgetScore == null  ? "var(--color-text-muted)"
    : budgetScore.pct >= 80 ? "var(--color-income)"
    : budgetScore.pct >= 50 ? "var(--color-expense)"
    : "var(--color-danger)";

  return (
    <>
      {/* ── Zone 1: Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Month-End Review</h1>
          <p className="page-subtitle">Your financial report card for the period</p>
        </div>
        <div className="page-header-actions">
          <div className="pill-group">
            {REVIEW_PERIODS.map((p) => (
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
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError?.(null)}>×</button>
        </div>
      )}

      {/* ── Zone 2: Cash flow KPIs ── */}
      {summary && (
        <div className="grid-stats" style={{ marginBottom: 14 }}>
          <SummaryKpi
            label="INCOME"
            value={formatAmount(summary.totalIncome)}
            color="var(--color-income)"
            sub="earned this period"
          />
          <SummaryKpi
            label="EXPENSES"
            value={formatAmount(summary.totalExpenses)}
            color="var(--color-expense)"
            sub="spent this period"
          />
          <SummaryKpi
            label="NET"
            value={`${netSign}${formatAmount(Math.abs(net))}`}
            color={netColor}
            sub={net >= 0 ? "surplus — well done" : "deficit — over budget"}
          />
          {summary.totalSavings > 0 && (
            <SummaryKpi
              label="SAVED"
              value={formatAmount(summary.totalSavings)}
              color="var(--color-savings)"
              sub="deposited to goals"
            />
          )}
        </div>
      )}

      {/* ── Zone 3: Insights ── */}
      {insights.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 className="section-header">Key Insights</h2>
          {insights.map((ins, i) => (
            <InsightChip key={i} type={ins.type} text={ins.text} />
          ))}
        </div>
      )}

      {/* ── Zone 4: Budget scorecard + Bills ── */}
      <div className="grid-chart-secondary" style={{ marginBottom: 14 }}>

        {/* Budget scorecard */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h2 className="section-header" style={{ margin: 0 }}>Budget Scorecard</h2>
            {budgetScore && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ScoreRing pct={budgetScore.pct} color={scoreColor} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: scoreColor }}>
                    {budgetScore.passed}/{budgetScore.total} categories
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                    within budget
                  </div>
                </div>
              </div>
            )}
          </div>
          {categories.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center", padding: "12px 0" }}>
              No budget categories found for this period.
            </p>
          ) : (
            categories.map((cat) => (
              <CategoryScoreRow
                key={cat.name}
                {...cat}
                fmt={formatAmount}
              />
            ))
          )}
        </div>

        {/* Bills + Debt snapshot */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Bills */}
          <div className="card" style={{ marginBottom: 0, flex: 1 }}>
            <h2 className="section-header">Bills Status</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: "10px 8px",
                  background: "rgba(16,185,129,0.06)",
                  borderRadius: 8,
                  border: "0.5px solid rgba(16,185,129,0.15)",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-income)" }}>
                  {bills.paid.length}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>Paid</div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "10px 8px",
                  background: bills.unpaid.length > 0 ? "rgba(239,68,68,0.06)" : "rgba(100,116,139,0.06)",
                  borderRadius: 8,
                  border: `0.5px solid ${bills.unpaid.length > 0 ? "rgba(239,68,68,0.15)" : "rgba(100,116,139,0.1)"}`,
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: bills.unpaid.length > 0 ? "var(--color-danger)" : "var(--color-text-muted)",
                  }}
                >
                  {bills.unpaid.length}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>Unpaid</div>
              </div>
            </div>
            {bills.paidTotal > 0 && (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>
                {formatAmount(bills.paidTotal)} total paid
              </div>
            )}
            {bills.unpaid.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-danger)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Still Unpaid
                </div>
                {bills.unpaid.slice(0, 4).map((b) => (
                  <div
                    key={b.id ?? b.name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                      padding: "4px 0",
                      borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <span>{b.name}</span>
                    <span style={{ color: "var(--color-danger)", fontWeight: 500 }}>
                      {formatAmount(parseFloat(b.amount ?? 0))}
                    </span>
                  </div>
                ))}
                {bills.unpaid.length > 4 && (
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
                    +{bills.unpaid.length - 4} more unpaid
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Debt snapshot */}
          {debt.count > 0 && (
            <div className="card" style={{ marginBottom: 0 }}>
              <h2 className="section-header">Debt Snapshot</h2>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Total balance ({debt.count} {debt.count === 1 ? "debt" : "debts"})
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-expense)" }}>
                  {formatAmount(debt.total)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Monthly minimums</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {formatAmount(debt.minPayment)}/mo
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Zone 5: Demo notice ── */}
      {isDemo && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "rgba(167,139,250,0.06)",
            border: "0.5px solid rgba(167,139,250,0.15)",
            fontSize: 12,
            color: "var(--color-text-muted)",
            textAlign: "center",
          }}
        >
          Demo mode — showing illustrative data. Connect a real account to see your actual month-end review.
        </div>
      )}
    </>
  );
}
