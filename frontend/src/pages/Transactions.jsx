import { useMemo, useState, useEffect, useCallback } from "react";

import {
  PERIOD_OPTIONS,
  PAYMENT_METHODS,
  BASE_PAYMENT_METHODS,
  BLANK_FORM,
  fmt,
  formatDate,
  initials,
  buildCategoryGroups,
  useTransactions,
} from "../api/Transaction";

import {
  getRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  logRecurring,
} from "../api/recurring";

import ImportWizard from "./ImportWizard";
import ExportModal from "../components/ExportModal";
import { useSettings } from "../context/SettingsContext";

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

// ── Transaction Row ───────────────────────────────────────────────────────────

function TxRow({
  tx,
  getCategoryConfig,
  onEdit,
  onDelete,
  deletingId,
  onConfirmDelete,
  onCancelDelete,
}) {
  // FIX (colors): use live getCategoryConfig from SettingsContext instead of
  // the hardcoded CATEGORY_CONFIG from MockData so Settings color changes apply.
  const cfg = getCategoryConfig(tx.category);
  const isIncome = tx.type === "income";
  const isSavings = tx.type === "savings";
  const isTransfer = tx.type === "transfer";  // #15
  const isDeleting = deletingId === tx.id;
  const isDraft = tx.isDraft;

  // FIX #8: Purple tint only on savings that are STILL drafts.
  // Once payment method is confirmed (isDraft=false), savings rows look normal.
  // Transfers get a subtle cyan tint so they stand out as neutral movements.
  const savingsDraft = isSavings && isDraft;
  const rowBorderColor = isTransfer
    ? "rgba(56,189,248,0.4)"
    : savingsDraft
      ? "rgba(167,139,250,0.5)"
      : isDraft
        ? "rgba(239,68,68,0.6)"
        : "transparent";
  const rowBg = isTransfer
    ? "rgba(56,189,248,0.03)"
    : savingsDraft
      ? "rgba(167,139,250,0.04)"
      : isDraft
        ? "rgba(239,68,68,0.03)"
        : undefined;

  return (
    <div
      className="tx-row"
      style={{
        gap: 12,
        borderLeft: `2px solid ${rowBorderColor}`,
        paddingLeft: isTransfer || savingsDraft || isDraft ? 8 : undefined,
        background: rowBg,
      }}
    >
      <div className="tx-col-avatar">
        <div
          className="avatar"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {initials(tx.description)}
        </div>
      </div>

      <div className="tx-col-desc">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="tx-name">{tx.description}</span>
          {/* #15 — Transfer badge */}
          {isTransfer && (
            <span
              className="badge"
              style={{
                background: "rgba(56,189,248,0.12)",
                color: "#38BDF8",
                fontSize: 10,
              }}
            >
              Transfer
            </span>
          )}
          {isDraft && !isSavings && !isTransfer && (
            <span
              className="badge"
              style={{
                background: "rgba(239,68,68,0.12)",
                color: "var(--color-danger)",
                fontSize: 10,
              }}
            >
              Incomplete
            </span>
          )}
          {isSavings && isDraft && (
            <span
              className="badge"
              style={{
                background: "rgba(167,139,250,0.12)",
                color: "var(--color-savings)",
                fontSize: 10,
              }}
            >
              Confirm payment
            </span>
          )}
          {isSavings && !isDraft && (
            <span
              className="badge"
              style={{
                background: "rgba(167,139,250,0.12)",
                color: "var(--color-savings)",
                fontSize: 10,
              }}
            >
              Savings
            </span>
          )}
        </div>
        <div
          className="tx-meta"
          style={{
            color: !tx.method
              ? "var(--color-danger)"
              : "var(--color-text-muted)",
            fontWeight: !tx.method ? 500 : 400,
          }}
        >
          {tx.method ?? "⚠ Payment method required"}
        </div>
      </div>

      <div
        className="tx-col-cat"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <span
          className="cat-dot"
          style={{
            background: isTransfer
              ? "#38BDF8"
              : isSavings
                ? "var(--color-savings)"
                : cfg.color,
          }}
        />
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {tx.category}
        </span>
      </div>

      <div className="tx-col-date tx-date">{formatDate(tx.date)}</div>

      <div className="tx-col-type">
        <span
          className={`badge ${
            isIncome
              ? "badge-income"
              : isSavings
                ? "badge-savings"
                : isTransfer
                  ? ""
                  : "badge-expense"
          }`}
          style={
            isTransfer
              ? { background: "rgba(56,189,248,0.12)", color: "#38BDF8" }
              : undefined
          }
        >
          {isIncome
            ? "Income"
            : isSavings
              ? "Savings"
              : isTransfer
                ? "Transfer"
                : "Expense"}
        </span>
      </div>

      <div className="tx-col-amount">
        <span
          className={`tx-amount ${
            isIncome
              ? "income"
              : isSavings
                ? "savings"
                : isTransfer
                  ? ""
                  : "expense"
          }`}
          style={
            isSavings
              ? { color: "var(--color-savings)" }
              : isTransfer
                ? { color: "#38BDF8" }
                : undefined
          }
        >
          {isIncome ? "+" : isTransfer ? "↔ " : "−"}
          {fmt(tx.amount)}
        </span>
      </div>

      <div
        className="tx-col-action"
        style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}
      >
        {isDeleting ? (
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
                padding: "2px 6px",
                fontSize: 11,
              }}
              onClick={() => onConfirmDelete(tx.id)}
            >
              Yes
            </button>
            <button
              className="btn-danger"
              style={{ padding: "2px 6px", fontSize: 11 }}
              onClick={onCancelDelete}
            >
              No
            </button>
          </div>
        ) : (
          <>
            <button
              className="btn-danger"
              title={
                isSavings
                  ? "Edit payment details"
                  : isDraft
                    ? "Complete this transaction"
                    : "Edit"
              }
              onClick={() => onEdit(tx)}
              style={
                isDraft || isSavings
                  ? { color: "var(--color-income)" }
                  : undefined
              }
            >
              <IconEdit />
            </button>
            <button
              className="btn-danger"
              title="Delete"
              onClick={() => onDelete(tx.id)}
            >
              <IconDelete />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CategoryFilterPanel — collapsible multi-select pill strip
// ─────────────────────────────────────────────────────────────────────────────

// categories: flat array of { name, color } covering ALL transaction types
function CategoryFilterPanel({ categories, selected, onChange }) {
  const [open, setOpen] = useState(false);

  const allCats = categories ?? [];

  const toggle = (name) => {
    onChange(
      selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name],
    );
  };

  const clear = () => onChange([]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignSelf: "flex-start",
      }}
    >
      {/* Trigger — styled as a pill-group to match the type / period filters */}
      <div className="pill-group">
        <button
          className={`pill${open ? " active" : ""}`}
          onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          {open ? "▾" : "▸"} Categories
          {selected.length > 0 && (
            <span
              className="count-badge"
              style={{
                background: "rgba(16,185,129,0.2)",
                color: "var(--color-income)",
                padding: "1px 7px",
                fontSize: 10,
              }}
            >
              {selected.length}
            </span>
          )}
        </button>
        {selected.length > 0 && (
          <button
            className="pill"
            style={{ fontSize: 11, color: "var(--color-text-muted)" }}
            onClick={clear}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Dropdown — full-width panel that pushes content down */}
      {open && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            background: "var(--color-bg-card)",
            border: "var(--border-default)",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            // Stretch to fill the pill-group-row so it doesn't look floated
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {allCats.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              No categories available
            </span>
          ) : (
            allCats.map(({ name, color }) => {
              const on = selected.includes(name);
              return (
                <button
                  key={name}
                  className={`pill${on ? " active" : ""}`}
                  onClick={() => toggle(name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    background: on ? undefined : "rgba(255,255,255,0.03)",
                    border: `1px solid ${on ? "transparent" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <span
                    className="cat-dot"
                    style={{ background: on ? "#022c22" : color }}
                  />
                  {name}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

function TxModal({
  form,
  isEditing,
  editingTx,
  onChange,
  onTypeChange,
  onSave,
  onClose,
  categoryGroups,
  paymentMethods,
  creditCardNames,
}) {
  // For savings transactions: only amount, date, and payment method are editable
  const isSavings = editingTx?.type === "savings";
  const isCC = creditCardNames?.includes(form.method);

  const canSave =
    form.description.trim() &&
    +form.amount > 0 &&
    form.date &&
    (isSavings || form.method); // savings can still be saved without method (is_draft)

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
            {isEditing
              ? isSavings
                ? "Edit Savings Transaction"
                : "Edit Transaction"
              : "Add Transaction"}
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {/* Savings lock notice */}
        {isSavings && (
          <div
            style={{
              background: "rgba(167,139,250,0.08)",
              border: "0.5px solid rgba(167,139,250,0.2)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 16,
              fontSize: 12,
              color: "var(--color-text-secondary)",
            }}
          >
            This is a savings contribution. Type and category are locked. You
            can update the amount, date, and confirm the payment method.
          </div>
        )}

        {/* Description */}
        <div className="field-wrap" style={{ marginBottom: 12 }}>
          <label className="field-label">Description</label>
          <input
            className="input"
            placeholder="e.g. Grocery Market, Salary Deposit"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            disabled={isSavings}
            style={
              isSavings ? { opacity: 0.5, cursor: "not-allowed" } : undefined
            }
          />
        </div>

        {/* Amount + Date */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Amount</label>
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
            <label className="field-label">Date</label>
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => onChange({ ...form, date: e.target.value })}
            />
          </div>
        </div>

        {/* Type + Category — locked for savings */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Type</label>
            <select
              className="input"
              value={form.type}
              onChange={(e) => onTypeChange(e.target.value)}
              disabled={isSavings}
              style={
                isSavings ? { opacity: 0.5, cursor: "not-allowed" } : undefined
              }
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
              {isSavings && <option value="savings">Savings</option>}
            </select>
          </div>
          <div className="field-wrap">
            <label className="field-label">Category</label>
            {isSavings ? (
              <input
                className="input"
                value={form.category}
                disabled
                style={{ opacity: 0.5, cursor: "not-allowed" }}
              />
            ) : (
              <select
                className="input"
                value={form.category}
                onChange={(e) =>
                  onChange({ ...form, category: e.target.value })
                }
              >
                {categoryGroups.map((group) => (
                  <optgroup key={group.header} label={group.header}>
                    {group.options.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Payment Method */}
        <div className="field-wrap" style={{ marginBottom: 20 }}>
          <label className="field-label">
            Payment Method
            {!form.method && (
              <span
                style={{
                  color: "var(--color-danger)",
                  marginLeft: 6,
                  fontSize: 10,
                }}
              >
                ⚠ Required
              </span>
            )}
          </label>
          <select
            className="input"
            value={form.method}
            onChange={(e) => onChange({ ...form, method: e.target.value })}
            style={
              !form.method
                ? { border: "0.5px solid rgba(239,68,68,0.5)" }
                : undefined
            }
          >
            {!form.method && (
              <option value="" disabled>
                Select payment method…
              </option>
            )}
            {(paymentMethods ?? PAYMENT_METHODS).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {isCC && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.4 }}>
              💳 This will be charged to your <strong>{form.method}</strong> balance — no cash will be deducted from your account.
            </p>
          )}
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={onSave} disabled={!canSave}>
            {isEditing ? "Save Changes" : "Add Transaction"}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recurring Transactions Panel (#22) ───────────────────────────────────────
// Self-contained component — fetches and manages recurring transaction templates.
// "Log Now" creates a real transaction and advances next_due via the backend.

const RECUR_FREQ = ["monthly", "weekly", "yearly", "daily"];
const RECUR_TYPES = ["expense", "income", "transfer"];
const BLANK_RECUR = { description: "", amount: "", type: "expense", category: "", frequency: "monthly", next_due: "" };

function RecurringPanel({ isDemo }) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(!isDemo);
  const [showModal, setShowModal] = useState(false);
  const [editingRec, setEditingRec] = useState(null);
  const [form, setForm]           = useState(BLANK_RECUR);
  const [saving, setSaving]       = useState(false);
  const [logging, setLogging]     = useState(null); // id being logged

  // Build category groups from the form's own type so income templates show
  // income categories and expense templates show expense categories.
  const { allCategories } = useSettings();
  const recurCategoryGroups = useMemo(
    () => buildCategoryGroups(allCategories, form.type),
    [allCategories, form.type],
  );

  const load = useCallback(async () => {
    if (isDemo) return;
    try {
      const res = await getRecurring();
      setItems(res.data ?? []);
    } catch (_) { /* ignore */ }
    finally { setLoading(false); }
  }, [isDemo]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingRec(null);
    setForm(BLANK_RECUR);
    setShowModal(true);
  }
  function openEdit(item) {
    setEditingRec(item);
    setForm({
      description: item.description,
      amount:      String(item.amount),
      type:        item.type,
      category:    item.category ?? "",
      frequency:   item.frequency,
      next_due:    item.next_due ?? "",
    });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditingRec(null); }

  async function handleSave() {
    if (!form.description.trim() || !form.amount) return;
    setSaving(true);
    const payload = {
      description: form.description.trim(),
      amount:      parseFloat(form.amount),
      type:        form.type,
      category:    form.category.trim() || form.description.trim(),
      frequency:   form.frequency,
      next_due:    form.next_due || null,
      is_active:   true,
    };
    try {
      if (editingRec) {
        await updateRecurring(editingRec.id, payload);
      } else {
        await createRecurring(payload);
      }
      await load();
      closeModal();
    } catch (_) { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try {
      await deleteRecurring(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (_) { /* ignore */ }
  }

  async function handleLog(item) {
    setLogging(item.id);
    try {
      await logRecurring(item.id);
      await load(); // refresh next_due
    } catch (_) { /* ignore */ }
    finally { setLogging(null); }
  }

  if (isDemo) return null;

  return (
    <>
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className="section-header" style={{ margin: 0 }}>Recurring</h2>
            {items.length > 0 && <span className="count-badge">{items.length}</span>}
          </div>
          <button className="btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={openAdd}>
            + Add Template
          </button>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 48, borderRadius: 8 }} />
        ) : items.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0, textAlign: "center", padding: "12px 0" }}>
            No recurring templates yet. Add one to quickly log regular transactions.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item) => {
              const isExp = item.type === "expense";
              const isInc = item.type === "income";
              const amtColor = isInc ? "var(--color-income)" : isExp ? "var(--color-expense)" : "#38BDF8";
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--color-bg-input)",
                    borderRadius: 8,
                    border: "0.5px solid rgba(255,255,255,0.06)",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                      {item.frequency} · {item.category}
                      {item.next_due ? ` · next ${item.next_due}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: amtColor }}>
                      {isInc ? "+" : isExp ? "−" : "↔ "}{fmt(item.amount)}
                    </span>
                    <button
                      className="btn-primary"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      onClick={() => handleLog(item)}
                      disabled={logging === item.id}
                      title="Log this transaction now"
                    >
                      {logging === item.id ? "…" : "Log"}
                    </button>
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 13, padding: "2px 4px" }}
                      onClick={() => openEdit(item)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 15, padding: "2px 4px" }}
                      onClick={() => handleDelete(item.id)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="card" style={{ width: 440, maxWidth: "calc(100vw - 40px)", margin: 0, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="section-header" style={{ margin: 0 }}>{editingRec ? "Edit Template" : "New Recurring Template"}</h2>
              <button className="btn-danger" onClick={closeModal} style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field-wrap">
                <label className="field-label">Description</label>
                <input className="input" placeholder="e.g. Netflix subscription" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="recurring-modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field-wrap" style={{ marginBottom: 0 }}>
                  <label className="field-label">Amount</label>
                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="field-wrap" style={{ marginBottom: 0 }}>
                  <label className="field-label">Type</label>
                  <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    {RECUR_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="field-wrap" style={{ marginBottom: 0 }}>
                  <label className="field-label">Frequency</label>
                  <select className="input" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
                    {RECUR_FREQ.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                  </select>
                </div>
                <div className="field-wrap" style={{ marginBottom: 0 }}>
                  <label className="field-label">Next Due</label>
                  <input className="input" type="date" value={form.next_due} onChange={(e) => setForm((f) => ({ ...f, next_due: e.target.value }))} />
                </div>
              </div>
              <div className="field-wrap">
                <label className="field-label">Category (optional)</label>
                <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  <option value="">— same as description —</option>
                  {recurCategoryGroups.map((g) => (
                    <optgroup key={g.header} label={g.header}>
                      {g.options.map((name) => <option key={name} value={name}>{name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button className="btn-primary" onClick={handleSave} disabled={saving || !form.description.trim() || !form.amount}>
                  {saving ? "Saving…" : editingRec ? "Update" : "Create"}
                </button>
                <button className="btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Transactions View — default export ────────────────────────────────────────

export default function Transactions() {
  const {
    filtered,
    loading,
    error,
    setError,
    typeFilter,
    setTypeFilter,
    periodFilter,
    setPeriodFilter,
    totalIncome,
    totalExpenses,
    totalSavings,
    net,
    showModal,
    editingTx,
    form,
    setForm,
    openAdd,
    openEdit,
    closeModal,
    deletingId,
    handleDelete,
    handleCancelDelete,
    handleConfirmDelete,
    handleSave,
    handleTypeChange,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    categoryGroups,
    filterCategories,
    getCategoryConfig,
    paymentMethods,
    creditCardNames,
    isDemo,
  } = useTransactions();

  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

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
      {/* ── Zone 1: Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">
            All income, expenses, and savings across your accounts
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            ↑ Import
          </button>
          <button className="btn-secondary" onClick={() => setShowExport(true)}>
            ↓ Export
          </button>
          <button className="btn-primary" onClick={openAdd}>
            + Add Transaction
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* ── Zone 2: Filter Pills — now includes Savings ── */}
      <div className="pill-group-row">
        <div className="pill-group">
          {["All", "Income", "Expense", "Savings", "Transfer"].map((f) => (
            <button
              key={f}
              className={`pill${typeFilter === f ? " active" : ""}`}
              onClick={() => setTypeFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="pill-group">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p}
              className={`pill${periodFilter === p ? " active" : ""}`}
              onClick={() => setPeriodFilter(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <CategoryFilterPanel
          categories={filterCategories}
          selected={categoryFilter}
          onChange={setCategoryFilter}
        />
      </div>

      {/* ── Zone 3: Table ── */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div
          className="tx-card-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className="section-header" style={{ margin: 0 }}>
              All Transactions
            </h2>
            <span className="count-badge">{filtered.length}</span>
          </div>

          {/* Search input */}
          <div className="tx-search-wrap" style={{ position: "relative", flexShrink: 0 }}>
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
              🔍
            </span>
            <input
              className="input"
              type="text"
              placeholder="Search description or category…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: 30,
                paddingRight: searchQuery ? 28 : 10,
                width: 240,
                fontSize: 12,
                height: 32,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* In/Out/Savings/Net summary — hidden on mobile (tx-header-summary) */}
          <div className="tx-header-summary" style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
              }}
            >
              <span
                className="cat-dot"
                style={{ background: "var(--color-income)" }}
              />
              <span style={{ color: "var(--color-text-muted)" }}>In</span>
              <span style={{ color: "var(--color-income)", fontWeight: 600 }}>
                {fmt(totalIncome)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
              }}
            >
              <span
                className="cat-dot"
                style={{ background: "var(--color-expense)" }}
              />
              <span style={{ color: "var(--color-text-muted)" }}>Out</span>
              <span
                style={{ color: "var(--color-text-primary)", fontWeight: 600 }}
              >
                {fmt(totalExpenses)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
              }}
            >
              <span
                className="cat-dot"
                style={{ background: "var(--color-savings)" }}
              />
              <span style={{ color: "var(--color-text-muted)" }}>Savings</span>
              <span style={{ color: "var(--color-savings)", fontWeight: 600 }}>
                {fmt(totalSavings)}
              </span>
            </div>
            <div
              style={{
                width: "0.5px",
                height: 14,
                background: "rgba(255,255,255,0.1)",
              }}
            />
            <div style={{ fontSize: 12 }}>
              <span style={{ color: "var(--color-text-muted)" }}>Net </span>
              <span
                style={{
                  fontWeight: 600,
                  color:
                    net >= 0 ? "var(--color-income)" : "var(--color-expense)",
                }}
              >
                {net >= 0 ? "+" : "−"}
                {fmt(Math.abs(net))}
              </span>
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div
          className="tx-row tx-header-row"
          style={{ paddingTop: 0, gap: 12 }}
        >
          <div className="tx-col-avatar" />
          <div className="tx-col-desc  col-header">Description</div>
          <div className="tx-col-cat   col-header">Category</div>
          <div className="tx-col-date  col-header">Date</div>
          <div className="tx-col-type  col-header">Type</div>
          <div
            className="tx-col-amount col-header"
            style={{ textAlign: "right" }}
          >
            Amount
          </div>
          <div className="tx-col-action" />
        </div>

        {/* Rows */}
        {filtered.length > 0 ? (
          filtered.map((tx) => (
            <TxRow
              key={tx.id}
              tx={tx}
              getCategoryConfig={getCategoryConfig}
              onEdit={openEdit}
              onDelete={handleDelete}
              deletingId={deletingId}
              onConfirmDelete={handleConfirmDelete}
              onCancelDelete={handleCancelDelete}
            />
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No transactions found</div>
            <div className="empty-body">
              Try adjusting your filters, or add a new transaction.
            </div>
            <button className="btn-primary" onClick={openAdd}>
              + Add Transaction
            </button>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <TxModal
          form={form}
          isEditing={!!editingTx}
          editingTx={editingTx}
          onChange={setForm}
          onTypeChange={handleTypeChange}
          onSave={handleSave}
          onClose={closeModal}
          categoryGroups={categoryGroups}
          paymentMethods={paymentMethods}
          creditCardNames={creditCardNames}
        />
      )}

      {/* ── Import Wizard ── */}
      {showImport && (
        <ImportWizard
          onClose={() => setShowImport(false)}
          onImportComplete={() => {
            setShowImport(false);
            // Re-fetch transactions after successful import
            window.location.reload();
          }}
          categoryGroups={categoryGroups}
        />
      )}

      {/* ── Export Modal ── */}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}

      {/* ── Recurring Transactions (#22) ── */}
      <RecurringPanel isDemo={isDemo} />
    </>
  );
}
