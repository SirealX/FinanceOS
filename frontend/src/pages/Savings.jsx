/**
 * frontend/src/pages/Savings.jsx — Presentation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * React components only. Every value, handler, and derived datum comes from
 * useSavings() in api/Savings.js.
 *
 * COMPONENTS
 *   GoalCard      — individual savings goal card with progress bar
 *   GoalModal     — add / edit goal modal with emoji picker
 *   FundsModal    — "Add Funds" modal with live progress preview
 *   Savings       — default export, assembles all zones
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";

import {
  formatAmount,
  pct,
  deadlineLabel,
  remaining,
  SAVINGS_EMOJI_PRESETS,
  useSavings,
} from "../api/Saving";

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

function IconCheck() {
  return (
    <svg
      viewBox="0 0 15 15"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="2.5,8 6,11.5 12.5,4" />
    </svg>
  );
}

function IconClock({ color }) {
  return (
    <svg
      viewBox="0 0 15 15"
      width="12"
      height="12"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="7.5" cy="7.5" r="6" />
      <polyline points="7.5,4.5 7.5,7.5 9.5,9.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalCard
// ─────────────────────────────────────────────────────────────────────────────

function GoalCard({ goal, onEdit, onDelete, onAddFunds }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isComplete = goal.current >= goal.target;
  const progress = pct(goal.current, goal.target);
  const dl = deadlineLabel(goal.deadline, isComplete);
  const barColor = isComplete ? "var(--color-income)" : "var(--color-savings)";

  return (
    <div
      className="card"
      style={{
        marginBottom: 0,
        border: isComplete
          ? "0.5px solid rgba(16,185,129,0.25)"
          : "var(--border-default)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header: emoji + name + actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: isComplete
                ? "rgba(16,185,129,0.12)"
                : "rgba(167,139,250,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {goal.emoji}
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--color-text-primary)",
                lineHeight: 1.2,
              }}
            >
              {goal.name}
            </div>
            {isComplete && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 3,
                }}
              >
                <span style={{ color: "var(--color-income)" }}>
                  <IconCheck />
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--color-income)",
                    fontWeight: 500,
                  }}
                >
                  Goal reached!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
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
                onClick={() => onDelete(goal.id)}
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
                title="Edit"
                onClick={() => onEdit(goal)}
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

      {/* Current amount */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.5px",
          color: isComplete ? "var(--color-income)" : "var(--color-savings)",
          marginBottom: 2,
        }}
      >
        {formatAmount(goal.current)}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginBottom: 14,
        }}
      >
        of {formatAmount(goal.target)} goal
      </div>

      {/* Progress bar */}
      <div className="progress-track goal" style={{ marginBottom: 8 }}>
        <div
          className="progress-fill"
          style={{
            width: `${progress}%`,
            background: barColor,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* % complete + remaining */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: barColor }}>
          {progress.toFixed(1)}%
        </span>
        {!isComplete && (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {formatAmount(remaining(goal))} to go
          </span>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
          marginBottom: 14,
        }}
      />

      {/* Footer: deadline + CTA */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {dl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <IconClock color={dl.color} />
            <span style={{ fontSize: 12, color: dl.color }}>{dl.text}</span>
          </div>
        ) : (
          <div />
        )}

        {isComplete ? (
          <span className="badge badge-income" style={{ fontSize: 11 }}>
            ✓ Complete
          </span>
        ) : (
          <button
            className="btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() => onAddFunds(goal)}
          >
            + Add Funds
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalModal — add / edit
// ─────────────────────────────────────────────────────────────────────────────

function GoalModal({ form, isEditing, onChange, onSave, onClose }) {
  const canSave = form.name.trim() && +form.target > 0 && form.deadline;

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
        style={{ width: 480, maxWidth: "calc(100vw - 40px)", margin: 0 }}
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
            {isEditing ? "Edit Goal" : "New Savings Goal"}
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {/* Emoji picker */}
        <div className="field-wrap" style={{ marginBottom: 16 }}>
          <label className="field-label">Icon</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SAVINGS_EMOJI_PRESETS.map((e) => (
              <button
                key={e}
                onClick={() => onChange({ ...form, emoji: e })}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  fontSize: 18,
                  background:
                    form.emoji === e
                      ? "rgba(167,139,250,0.2)"
                      : "var(--color-bg-input)",
                  border:
                    form.emoji === e
                      ? "0.5px solid rgba(167,139,250,0.5)"
                      : "0.5px solid rgba(255,255,255,0.07)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s, border 0.15s",
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Goal Name */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Goal Name</label>
          <input
            className="input"
            placeholder="e.g. Emergency Fund, Dream Vacation, New Laptop"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
          />
        </div>

        {/* Target · Current */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Target Amount ($)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.target}
              onChange={(e) => onChange({ ...form, target: e.target.value })}
            />
          </div>
          <div className="field-wrap">
            <label className="field-label">Current Amount ($)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.current}
              onChange={(e) => onChange({ ...form, current: e.target.value })}
            />
          </div>
        </div>

        {/* Deadline */}
        <div className="field-wrap" style={{ marginBottom: 20 }}>
          <label className="field-label">Target Deadline</label>
          <input
            className="input"
            type="date"
            value={form.deadline}
            onChange={(e) => onChange({ ...form, deadline: e.target.value })}
          />
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={onSave} disabled={!canSave}>
            {isEditing ? "Save Changes" : "Create Goal"}
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
// FundsModal — log a contribution toward a goal
// ─────────────────────────────────────────────────────────────────────────────

function FundsModal({ goal, form, onChange, onSave, onClose }) {
  const canSave = +form.amount > 0;
  const after = goal.current + (+form.amount || 0);
  const willComplete = after >= goal.target;

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
        {/* Header */}
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
              Add Funds
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              {goal.emoji} {goal.name}
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

        {/* Progress preview */}
        <div
          style={{
            background: "var(--color-bg-input)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 16,
            border: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>
              {formatAmount(goal.current)} saved
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>
              {formatAmount(goal.target)} goal
            </span>
          </div>
          <div className="progress-track goal">
            <div
              className="progress-fill"
              style={{
                width: `${pct(after, goal.target)}%`,
                background: willComplete
                  ? "var(--color-income)"
                  : "var(--color-savings)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          {+form.amount > 0 && (
            <div
              style={{
                fontSize: 11,
                marginTop: 8,
                color: willComplete
                  ? "var(--color-income)"
                  : "var(--color-savings)",
                textAlign: "right",
              }}
            >
              {willComplete
                ? "🎉 This contribution completes your goal!"
                : `${formatAmount(after)} after deposit · ${pct(after, goal.target).toFixed(1)}%`}
            </div>
          )}
        </div>

        {/* Amount */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Amount ($)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => onChange({ ...form, amount: e.target.value })}
            autoFocus
          />
        </div>

        {/* Note */}
        <div className="field-wrap" style={{ marginBottom: 20 }}>
          <label className="field-label">Note (optional)</label>
          <input
            className="input"
            placeholder="e.g. Monthly transfer, bonus"
            value={form.note}
            onChange={(e) => onChange({ ...form, note: e.target.value })}
          />
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={onSave} disabled={!canSave}>
            Confirm Deposit
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
// Savings — default export
// ─────────────────────────────────────────────────────────────────────────────

export default function Savings() {
  const {
    goals,
    loading,
    error,
    setError,
    stats,
    showGoalModal,
    editingGoal,
    goalForm,
    setGoalForm,
    openAdd,
    openEdit,
    closeGoalModal,
    handleSaveGoal,
    handleDeleteGoal,
    fundsGoal,
    fundsForm,
    setFundsForm,
    openFunds,
    closeFunds,
    handleSaveFunds,
  } = useSavings();

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 260, borderRadius: 12 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Zone 1: Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Savings Goals</h1>
          <p className="page-subtitle">
            Track progress toward every financial target
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          + New Goal
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
          <div className="kpi-label">Total Saved</div>
          <div className="kpi-value savings">
            {formatAmount(stats.totalSaved)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            of {formatAmount(stats.totalTarget)} across {stats.total} goal
            {stats.total !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Overall Progress</div>
          <div className="kpi-value" style={{ color: "var(--color-savings)" }}>
            {stats.avgPct.toFixed(1)}%
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="progress-track budget">
              <div
                className="progress-fill"
                style={{
                  width: `${stats.avgPct}%`,
                  background: "var(--color-savings)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        </div>

        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Goals Complete</div>
          <div className="kpi-value income">{stats.complete}</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            {stats.total - stats.complete} still in progress
          </div>
        </div>
      </div>

      {/* ── Zone 3: Goal Cards ── */}
      {goals.length > 0 ? (
        <div className="grid-goals">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={openEdit}
              onDelete={handleDeleteGoal}
              onAddFunds={openFunds}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <div className="empty-title">No savings goals yet</div>
            <div className="empty-body">
              Create your first goal — an emergency fund, vacation, or anything
              worth saving for.
            </div>
            <button className="btn-primary" onClick={openAdd}>
              + New Goal
            </button>
          </div>
        </div>
      )}

      {/* ── Goal Modal ── */}
      {showGoalModal && (
        <GoalModal
          form={goalForm}
          isEditing={!!editingGoal}
          onChange={setGoalForm}
          onSave={handleSaveGoal}
          onClose={closeGoalModal}
        />
      )}

      {/* ── Add Funds Modal ── */}
      {fundsGoal && (
        <FundsModal
          goal={fundsGoal}
          form={fundsForm}
          onChange={setFundsForm}
          onSave={handleSaveFunds}
          onClose={closeFunds}
        />
      )}
    </>
  );
}
