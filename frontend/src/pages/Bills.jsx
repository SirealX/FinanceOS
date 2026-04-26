import { useState } from "react";

import {
  BILL_FREQUENCIES,
  PAYMENT_METHODS,
  formatAmount,
  initials,
  liveStatus,
  dueDateLabel,
  toMonthly,
  useBills,
} from "../api/Bill";

// ── Icons ─────────────────────────────────────────────────────────────────────

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
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="2.5,8 6,11.5 12.5,4" />
    </svg>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    paid: { cls: "badge-paid", label: "Paid" },
    unpaid: { cls: "badge-unpaid", label: "Unpaid" },
    "due-soon": { cls: "badge-due-soon", label: "Due Soon" },
    overdue: { cls: "badge-overdue", label: "Overdue" },
  };
  const { cls, label } = map[status] || map["unpaid"];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ── Bill Row ──────────────────────────────────────────────────────────────────

function BillRow({ bill, catCfg, onTogglePaid, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = liveStatus(bill);
  const dueLbl = dueDateLabel(bill);
  // FIX #2: use live color lookup passed from hook
  const cfg = catCfg(bill.category);
  const isPaid = status === "paid";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
        borderRadius: 6,
        transition: "background 0.12s, padding-inline 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        e.currentTarget.style.paddingLeft = "6px";
        e.currentTarget.style.paddingRight = "6px";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "";
        e.currentTarget.style.paddingLeft = "";
        e.currentTarget.style.paddingRight = "";
      }}
    >
      {/* Mark-paid toggle */}
      <button
        title={isPaid ? "Mark as unpaid" : "Mark as paid"}
        onClick={() => onTogglePaid(bill.id)}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          flexShrink: 0,
          border: isPaid ? "none" : "1.5px solid rgba(255,255,255,0.15)",
          background: isPaid ? "var(--color-income)" : "transparent",
          color: isPaid ? "#022c22" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "background 0.2s, border 0.2s",
        }}
      >
        {isPaid && <IconCheck />}
      </button>

      {/* Avatar */}
      <div
        className="avatar"
        style={{
          background: cfg.bg,
          color: cfg.color,
          flexShrink: 0,
          opacity: isPaid ? 0.5 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {initials(bill.name)}
      </div>

      {/* Name + frequency + category */}
      <div
        style={{
          flex: "1 1 0",
          minWidth: 0,
          opacity: isPaid ? 0.6 : 1,
          transition: "opacity 0.2s",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {bill.name}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
              background: "rgba(255,255,255,0.05)",
              padding: "1px 6px",
              borderRadius: 8,
              flexShrink: 0,
            }}
          >
            {bill.frequency}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          {bill.category}
        </div>
      </div>

      {/* Amount */}
      <div
        style={{
          flex: "0 0 90px",
          textAlign: "right",
          opacity: isPaid ? 0.5 : 1,
          transition: "opacity 0.2s",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.3px",
          }}
        >
          {formatAmount(bill.amount)}
        </div>
        {bill.frequency !== "Monthly" && (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
              marginTop: 1,
            }}
          >
            {formatAmount(toMonthly(bill.amount, bill.frequency))}/mo
          </div>
        )}
      </div>

      {/* Due date */}
      <div style={{ flex: "0 0 100px", textAlign: "center" }}>
        <div
          style={{
            fontSize: 13,
            color: dueLbl.color,
            fontWeight: isPaid ? 400 : 500,
          }}
        >
          {dueLbl.text}
        </div>
      </div>

      {/* Status badge */}
      <div
        style={{ flex: "0 0 90px", display: "flex", justifyContent: "center" }}
      >
        <StatusBadge status={status} />
      </div>

      {/* Actions */}
      <div
        style={{
          flex: "0 0 110px",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
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
              onClick={() => onDelete(bill.id)}
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
              onClick={() => onEdit(bill)}
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
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

function BillModal({
  form,
  isEditing,
  billCategoryNames,
  onChange,
  onSave,
  onClose,
}) {
  const canSave = form.name.trim() && +form.amount > 0 && form.dueDate;

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h2 className="section-header" style={{ margin: 0 }}>
            {isEditing ? "Edit Bill" : "Add Bill"}
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Bill Name</label>
          <input
            className="input"
            placeholder="e.g. Electric Bill, Gym, Streaming Service"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Amount ($)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => onChange({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="field-wrap">
            <label className="field-label">Due Date</label>
            <input
              className="input"
              type="date"
              value={form.dueDate}
              onChange={(e) => onChange({ ...form, dueDate: e.target.value })}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Frequency</label>
            <select
              className="input"
              value={form.frequency}
              onChange={(e) => onChange({ ...form, frequency: e.target.value })}
            >
              {BILL_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="field-wrap">
            <label className="field-label">Category</label>
            {/* FIX #1: live expense categories from SettingsContext */}
            <select
              className="input"
              value={form.category}
              onChange={(e) => onChange({ ...form, category: e.target.value })}
            >
              {billCategoryNames.length === 0 && (
                <option value="" disabled>
                  Loading categories…
                </option>
              )}
              {billCategoryNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={onSave} disabled={!canSave}>
            {isEditing ? "Save Changes" : "Add Bill"}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Payment Method Modal ──────────────────────────────────────────────────────

function PaymentMethodModal({ onConfirm, onClose }) {
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
        style={{ width: 340, maxWidth: "calc(100vw - 40px)", margin: 0 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <h2 className="section-header" style={{ margin: 0 }}>
            How did you pay?
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginBottom: 16,
          }}
        >
          Select the payment method to record this bill as paid.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PAYMENT_METHODS.map(({ value, label }) => (
            <button
              key={value}
              className="btn-secondary"
              style={{ justifyContent: "flex-start", padding: "10px 14px", fontSize: 13 }}
              onClick={() => onConfirm(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="btn-ghost"
          style={{ marginTop: 12, width: "100%", fontSize: 12 }}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Bills View ────────────────────────────────────────────────────────────────

export default function Bills() {
  const {
    filtered,
    loading,
    error,
    setError,
    filter,
    setFilter,
    stats,
    dueSoonCount,
    showModal,
    editingBill,
    form,
    setForm,
    openAdd,
    openEdit,
    closeModal,
    handleTogglePaid,
    handleSave,
    handleDelete,
    payModal,
    handleConfirmPayment,
    closePayModal,
    billCategoryNames, // FIX #1
    catCfg, // FIX #2
  } = useBills();

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <>
      {/* Zone 1 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Bills &amp; Subscriptions</h1>
          <p className="page-subtitle">
            Track recurring payments and never miss a due date
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          + Add Bill
        </button>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Zone 2 */}
      <div className="grid-stats" style={{ marginBottom: 14 }}>
        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Monthly Total</div>
          <div className="kpi-value expense">
            {formatAmount(stats.monthlyTotal)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            across all bills
          </div>
        </div>
        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Needs Attention</div>
          <div
            className="kpi-value"
            style={{
              color:
                stats.dueSoon + stats.overdue > 0
                  ? "var(--color-expense)"
                  : "var(--color-income)",
            }}
          >
            {stats.dueSoon + stats.overdue}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            {stats.overdue > 0
              ? `${stats.overdue} overdue · ${stats.dueSoon} due soon`
              : stats.dueSoon > 0
                ? `${stats.dueSoon} due within 7 days`
                : "All clear — nothing urgent"}
          </div>
        </div>
        <div className="card card-compact" style={{ marginBottom: 0 }}>
          <div className="kpi-label">Paid This Month</div>
          <div className="kpi-value income">{stats.paidCount}</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 8,
            }}
          >
            {formatAmount(stats.paidTotal)} paid so far
          </div>
        </div>
      </div>

      {/* Zone 3 */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className="section-header" style={{ margin: 0 }}>
              All Bills
            </h2>
            <span className="count-badge">{filtered.length}</span>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ marginBottom: 14 }}>
          <div className="pill-group">
            {["All", "Unpaid", "Due Soon", "Paid"].map((f) => (
              <button
                key={f}
                className={`pill${filter === f ? " active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f}
                {f === "Due Soon" && dueSoonCount > 0 && (
                  <span
                    style={{
                      marginLeft: 5,
                      background:
                        filter === "Due Soon"
                          ? "rgba(0,0,0,0.2)"
                          : "rgba(249,115,22,0.2)",
                      color:
                        filter === "Due Soon"
                          ? "#022c22"
                          : "var(--color-expense)",
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "0px 5px",
                      borderRadius: 8,
                    }}
                  >
                    {dueSoonCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 0 8px",
            borderBottom: "0.5px solid rgba(255,255,255,0.07)",
            pointerEvents: "none",
          }}
        >
          <div style={{ width: 22, flexShrink: 0 }} />
          <div style={{ width: 36, flexShrink: 0 }} />
          <div className="col-header" style={{ flex: "1 1 0" }}>
            Name
          </div>
          <div
            className="col-header"
            style={{ flex: "0 0 90px", textAlign: "right" }}
          >
            Amount
          </div>
          <div
            className="col-header"
            style={{ flex: "0 0 100px", textAlign: "center" }}
          >
            Due Date
          </div>
          <div
            className="col-header"
            style={{ flex: "0 0 90px", textAlign: "center" }}
          >
            Status
          </div>
          <div style={{ flex: "0 0 110px" }} />
        </div>

        {/* Rows */}
        {filtered.length > 0 ? (
          filtered.map((bill) => (
            <BillRow
              key={bill.id}
              bill={bill}
              catCfg={catCfg}
              onTogglePaid={handleTogglePaid}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <div className="empty-title">No bills match this filter</div>
            <div className="empty-body">
              Try a different filter, or add a new bill.
            </div>
            <button className="btn-primary" onClick={openAdd}>
              + Add Bill
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <BillModal
          form={form}
          isEditing={!!editingBill}
          billCategoryNames={billCategoryNames}
          onChange={setForm}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {payModal && (
        <PaymentMethodModal
          onConfirm={handleConfirmPayment}
          onClose={closePayModal}
        />
      )}
    </>
  );
}
