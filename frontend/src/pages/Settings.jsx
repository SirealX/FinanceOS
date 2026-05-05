/**
 * Settings.jsx — Presentation Layer
 */

import { useState, useEffect, useCallback } from "react";

import {
  CURRENCIES,
  DATE_FORMATS,
  MONTH_START_OPTIONS,
  COLOR_SWATCHES,
  CAT_TABS,
  DANGER_ACTIONS,
  hexToRgba,
  useSettingsPage,
} from "../api/Settings";

import { getCreditCards, createDebt, updateDebt, deleteDebt } from "../api/debts";
import { useAuth } from "../context/Authcontexts";

import ExportModal from "../components/ExportModal";
import ImportWizard from "./ImportWizard";

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "#334155",
        marginBottom: 12,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

// ── ColorPicker ───────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }) {
  const [customHex, setCustomHex] = useState("");
  const [hexError, setHexError] = useState(false);

  function handleCustomHex(raw) {
    setCustomHex(raw);
    const clean = raw.startsWith("#") ? raw : "#" + raw;
    const valid = /^#[0-9A-Fa-f]{6}$/.test(clean);
    setHexError(raw.length > 0 && !valid);
    if (valid) onChange(clean);
  }

  return (
    <div>
      <div
        style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}
      >
        {COLOR_SWATCHES.map((hex) => (
          <button
            key={hex}
            onClick={() => {
              onChange(hex);
              setCustomHex("");
              setHexError(false);
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: hex,
              border: "none",
              cursor: "pointer",
              outline: value === hex ? `2.5px solid ${hex}` : "none",
              outlineOffset: 2,
              transform: value === hex ? "scale(1.15)" : "scale(1)",
              transition: "outline 0.12s, transform 0.12s",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: value,
            flexShrink: 0,
            border: "0.5px solid rgba(255,255,255,0.15)",
          }}
        />
        <input
          className="input"
          placeholder="#A1B2C3"
          value={customHex}
          onChange={(e) => handleCustomHex(e.target.value)}
          style={{
            width: 120,
            border: hexError ? "0.5px solid rgba(239,68,68,0.6)" : undefined,
          }}
        />
        {hexError && (
          <span style={{ fontSize: 11, color: "var(--color-danger)" }}>
            Invalid hex
          </span>
        )}
        {!hexError && customHex && (
          <span style={{ fontSize: 11, color: "var(--color-income)" }}>✓</span>
        )}
      </div>
    </div>
  );
}

// ── CategoryModal ─────────────────────────────────────────────────────────────

function CategoryModal({ initial, isEditing, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState(null);
  const canSave = form.name.trim().length > 0;

  function handleSave() {
    const result = onSave(form);
    if (result?.error) setError(result.error);
  }

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
        style={{ width: 380, maxWidth: "calc(100vw - 40px)", margin: 0 }}
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
            {isEditing ? "Edit Category" : "New Category"}
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {/* Live preview */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--color-bg-input)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            border: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: hexToRgba(form.color),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: form.color,
                display: "inline-block",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: form.name
                ? "var(--color-text-primary)"
                : "var(--color-text-hint)",
            }}
          >
            {form.name || "Category name"}
          </span>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="field-wrap" style={{ marginBottom: 16 }}>
          <label className="field-label">Category Name</label>
          <input
            className="input"
            placeholder="e.g. Subscriptions, Pet Care"
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              setError(null);
            }}
            autoFocus
          />
        </div>

        <div className="field-wrap" style={{ marginBottom: 20 }}>
          <label className="field-label">Color</label>
          <ColorPicker
            value={form.color}
            onChange={(color) => setForm({ ...form, color })}
          />
        </div>

        <div className="form-actions">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {isEditing ? "Save Changes" : "Add Category"}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({ cat, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          flexShrink: 0,
          background: hexToRgba(cat.color),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: cat.color,
            display: "inline-block",
          }}
        />
      </div>

      <span
        style={{ flex: 1, fontSize: 13, color: "var(--color-text-primary)" }}
      >
        {cat.name}
      </span>

      {/* Kind badge — shown on the All tab */}
      {cat.kind && (
        <span
          className={`badge badge-${cat.kind === "income" ? "income" : cat.kind === "savings" ? "savings" : "neutral"}`}
          style={{ fontSize: 10 }}
        >
          {cat.kind}
        </span>
      )}

      {cat.system && (
        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
          System
        </span>
      )}

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
            onClick={() => onDelete(cat.id)}
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
        <div style={{ display: "flex", gap: 2 }}>
          <button
            className="btn-danger"
            title="Edit"
            onClick={() => onEdit(cat)}
          >
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
          </button>
          <button
            className="btn-danger"
            title={
              cat.system ? "System categories cannot be deleted" : "Delete"
            }
            disabled={cat.system}
            style={{
              opacity: cat.system ? 0.3 : 1,
              cursor: cat.system ? "not-allowed" : "pointer",
            }}
            onClick={() => !cat.system && setConfirmDelete(true)}
          >
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
          </button>
        </div>
      )}
    </div>
  );
}

// ── CreditCardSection ─────────────────────────────────────────────────────────

const BLANK_CC_FORM = {
  name: "",
  creditLimit: "",
  billingCycleEndDay: "",
  cardNetwork: "Visa",
  interestRate: "",
  minPayment: "",
};

const CARD_NETWORKS = ["Visa", "Mastercard", "Amex", "Discover", "Other"];

function CreditCardModal({ initial, isEditing, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState(null);
  const canSave = form.name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave(form).catch((err) => setError(err?.message ?? "Save failed."));
  }

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
        style={{ width: 420, maxWidth: "calc(100vw - 40px)", margin: 0 }}
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
            {isEditing ? "Edit Credit Card" : "Add Credit Card"}
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div className="field-wrap" style={{ gridColumn: "1 / -1" }}>
            <label className="field-label">Card Name *</label>
            <input
              className="input"
              placeholder="e.g. Chase Sapphire, Amex Gold"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>

          <div className="field-wrap">
            <label className="field-label">Network</label>
            <select
              className="input"
              value={form.cardNetwork}
              onChange={(e) => setForm({ ...form, cardNetwork: e.target.value })}
            >
              {CARD_NETWORKS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="field-wrap">
            <label className="field-label">Credit Limit</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5000"
              value={form.creditLimit}
              onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
            />
          </div>

          <div className="field-wrap">
            <label className="field-label">Interest Rate (APR %)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 24.99"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
            />
          </div>

          <div className="field-wrap">
            <label className="field-label">Min Monthly Payment</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 25"
              value={form.minPayment}
              onChange={(e) => setForm({ ...form, minPayment: e.target.value })}
            />
          </div>

          <div className="field-wrap" style={{ gridColumn: "1 / -1" }}>
            <label className="field-label">Statement Closing Day (1–28)</label>
            <input
              className="input"
              type="number"
              min="1"
              max="28"
              placeholder="e.g. 25"
              value={form.billingCycleEndDay}
              onChange={(e) =>
                setForm({ ...form, billingCycleEndDay: e.target.value })
              }
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Card"}
          </button>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CreditCardSection({ isDemo }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // null | { mode: "add"|"edit", card?: obj }
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const fetchCards = useCallback(async () => {
    if (isDemo) return;
    setLoading(true);
    try {
      const res = await getCreditCards();
      setCards(res.data ?? []);
    } catch (err) {
      setError("Could not load credit cards.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  async function handleSave(form) {
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      type: "credit_card",
      balance: 0,
      interest_rate: parseFloat(form.interestRate) || 0,
      min_payment: parseFloat(form.minPayment) || 0,
      credit_limit: parseFloat(form.creditLimit) || null,
      billing_cycle_end_day: form.billingCycleEndDay
        ? parseInt(form.billingCycleEndDay, 10)
        : null,
      card_network: form.cardNetwork || null,
    };
    try {
      if (modal?.card) {
        await updateDebt(modal.card.id, payload);
      } else {
        await createDebt(payload);
      }
      await fetchCards();
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDebt(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError("Could not delete card.");
      console.error(err);
    }
    setConfirmDeleteId(null);
  }

  const networkEmoji = (n) =>
    n === "Visa" ? "💳 Visa"
    : n === "Mastercard" ? "💳 MC"
    : n === "Amex" ? "💳 Amex"
    : n === "Discover" ? "💳 Disc."
    : "💳";

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
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
              Credit Cards
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              Cards added here appear as payment options in Transactions. Charges
              update the card balance automatically.
            </p>
          </div>
          {!isDemo && (
            <button
              className="btn-primary"
              onClick={() =>
                setModal({ mode: "add", card: null })
              }
            >
              + Add Card
            </button>
          )}
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {isDemo && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "0.5px solid rgba(255,255,255,0.07)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            Credit card management is not available in demo mode. Log in to add
            your cards.
          </div>
        )}

        {!isDemo && loading && (
          <div className="skeleton" style={{ height: 48, borderRadius: 8 }} />
        )}

        {!isDemo && !loading && cards.length === 0 && (
          <div className="empty-state" style={{ paddingTop: 24 }}>
            <div className="empty-icon">💳</div>
            <div className="empty-title">No credit cards yet</div>
            <div className="empty-body">
              Add a card to track balances and enable CC charging in Transactions.
            </div>
          </div>
        )}

        {!isDemo &&
          cards.map((card) => (
            <div
              key={card.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: "0.5px solid rgba(255,255,255,0.05)",
              }}
            >
              {/* Card icon */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "rgba(99,102,241,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                💳
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {card.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginTop: 2,
                  }}
                >
                  {card.card_network ? networkEmoji(card.card_network) : ""}
                  {card.credit_limit
                    ? ` · Limit $${parseFloat(card.credit_limit).toLocaleString()}`
                    : ""}
                  {card.billing_cycle_end_day
                    ? ` · Closes day ${card.billing_cycle_end_day}`
                    : ""}
                </div>
              </div>

              {/* Balance */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      parseFloat(card.balance ?? 0) > 0
                        ? "var(--color-expense)"
                        : "var(--color-text-muted)",
                  }}
                >
                  ${parseFloat(card.balance ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                    marginTop: 1,
                  }}
                >
                  balance
                </div>
              </div>

              {/* Actions */}
              {confirmDeleteId === card.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                    Remove?
                  </span>
                  <button
                    className="btn-danger"
                    style={{ fontSize: 11, padding: "2px 8px", color: "var(--color-danger)" }}
                    onClick={() => handleDelete(card.id)}
                  >
                    Yes
                  </button>
                  <button
                    className="btn-danger"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn-danger"
                    title="Edit"
                    onClick={() =>
                      setModal({
                        mode: "edit",
                        card,
                        initial: {
                          name: card.name,
                          creditLimit: card.credit_limit ?? "",
                          billingCycleEndDay: card.billing_cycle_end_day ?? "",
                          cardNetwork: card.card_network ?? "Visa",
                          interestRate: card.interest_rate ?? "",
                          minPayment: card.min_payment ?? "",
                        },
                      })
                    }
                  >
                    <svg viewBox="0 0 15 15" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.5 2.5l2 2-7 7H3.5v-2l7-7z" />
                    </svg>
                  </button>
                  <button
                    className="btn-danger"
                    title="Delete"
                    onClick={() => setConfirmDeleteId(card.id)}
                  >
                    <svg viewBox="0 0 15 15" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3,4 12,4" />
                      <path d="M5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
                      <rect x="3.5" y="4" width="8" height="9" rx="1" />
                      <line x1="6" y1="7" x2="6" y2="10.5" />
                      <line x1="9" y1="7" x2="9" y2="10.5" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Modal */}
      {modal && (
        <CreditCardModal
          initial={modal.initial ?? BLANK_CC_FORM}
          isEditing={!!modal.card}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </>
  );
}

// ── Settings — default export ─────────────────────────────────────────────────

export default function Settings() {
  const { isDemo } = useAuth();
  const {
    expenseCategories,
    incomeCategories,
    savingsCategories,
    catTab,
    setCatTab,
    catModal,
    setCatModal,
    activeCats,
    canAddOnTab,
    saved,
    draftDisplayName,
    setDraftDisplayName,
    draftCurrency,
    setDraftCurrency,
    draftDateFormat,
    setDraftDateFormat,
    draftMonthStart,
    setDraftMonthStart,
    amountPreview,
    datePreview,
    monthStartPreview,
    handleSavePreferences,
    openAddCat,
    openEditCat,
    handleSaveCat,
    handleDeleteCat,
    dangerPending,
    requestDangerAction,
    confirmDangerAction,
    cancelDangerAction,
    // Bank balance
    draftBankBalance,
    setDraftBankBalance,
    draftBankBalanceDate,
    setDraftBankBalanceDate,
    draftInitialBalance,
    setDraftInitialBalance,
    draftTrackingStartDate,
    setDraftTrackingStartDate,
    draftShowGap,
    setDraftShowGap,
    draftReminderDay,
    setDraftReminderDay,
    balanceSaved,
    settingsSummary,
    handleSaveBankBalance,
  } = useSettingsPage();

  const reconciliation = (() => {
    const closing = settingsSummary?.closing_balance ?? null;
    const bank = draftBankBalance !== "" ? parseFloat(draftBankBalance) : null;
    const seed =
      draftInitialBalance !== "" ? parseFloat(draftInitialBalance) : null;
    if (bank === null || closing === null) return null;
    const fullGap = bank - closing;
    const activeGap = seed !== null ? bank - seed - closing : null;
    return { closing, bank, seed, fullGap, activeGap };
  })();

  // Build categoryGroups for the ImportWizard (same shape as Transactions page)
  const categoryGroups = [
    expenseCategories.length > 0 && {
      header: "── Expenses ──────────────",
      options: expenseCategories.map((c) => c.name),
    },
    incomeCategories.length > 0 && {
      header: "── Income ────────────────",
      options: incomeCategories.map((c) => c.name),
    },
  ].filter(Boolean);

  // ── Import / Export modal state ────────────────────────────────────────────
  const [showExportCSV, setShowExportCSV] = useState(false);
  const [showExportXML, setShowExportXML] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      {/* ── Zone 1: Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Manage your preferences, currency, and categories
          </p>
        </div>
        <button className="btn-primary" onClick={handleSavePreferences}>
          {saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>

      {/* ── Profile ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-header">Profile</h2>
        <SectionLabel>Identity</SectionLabel>
        <div style={{ maxWidth: 320 }}>
          <div className="field-wrap" style={{ marginBottom: 8 }}>
            <label className="field-label">Display Name</label>
            <input
              className="input"
              placeholder="e.g. César"
              value={draftDisplayName}
              onChange={(e) => setDraftDisplayName(e.target.value)}
              maxLength={50}
            />
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              margin: "0 0 4px",
              lineHeight: 1.5,
            }}
          >
            This is how we greet you on the dashboard and in the sidebar. Hit
            "Save Changes" above to apply.
          </p>
        </div>
      </div>

      {/* ── General Settings ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-header">General</h2>
        <SectionLabel>Display</SectionLabel>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div className="field-wrap">
            <label className="field-label">Currency</label>
            <select
              className="input"
              value={draftCurrency}
              onChange={(e) => setDraftCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-wrap">
            <label className="field-label">Date Format</label>
            <select
              className="input"
              value={draftDateFormat}
              onChange={(e) => setDraftDateFormat(e.target.value)}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-wrap">
            <label className="field-label">Budget Month Starts On</label>
            <select
              className="input"
              value={draftMonthStart}
              onChange={(e) => setDraftMonthStart(+e.target.value)}
            >
              {MONTH_START_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 1
                    ? "1st (default)"
                    : d === 15
                      ? "15th (mid-month)"
                      : `${d}${d === 2 ? "nd" : d === 3 ? "rd" : "th"}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preview strip */}
        <div
          style={{
            background: "var(--color-bg-input)",
            borderRadius: 8,
            padding: "10px 14px",
            border: "0.5px solid rgba(255,255,255,0.06)",
            display: "flex",
            gap: 24,
          }}
        >
          {[
            { label: "Amount Preview", value: amountPreview },
            { label: "Date Preview", value: datePreview },
            { label: "Month Resets", value: monthStartPreview },
          ].map(({ label, value }, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && (
                <div
                  style={{
                    width: "0.5px",
                    background: "rgba(255,255,255,0.07)",
                    alignSelf: "stretch",
                    marginRight: 24,
                  }}
                />
              )}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                    letterSpacing: "0.5px",
                    marginBottom: 3,
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Categories ── */}
      <div className="card" style={{ marginBottom: 12 }}>
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
              Categories
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              Categories are used across Transactions and Budget. System
              categories cannot be deleted.
            </p>
          </div>
          {/* Only show "+ New Category" when on Expense or Income tab */}
          {canAddOnTab && (
            <button className="btn-primary" onClick={openAddCat}>
              + New Category
            </button>
          )}
        </div>

        {/* Four tabs */}
        <div
          className="pill-group"
          style={{ marginBottom: 16, width: "fit-content" }}
        >
          {CAT_TABS.map((tab) => {
            const count =
              tab.id === "expense"
                ? expenseCategories.length
                : tab.id === "income"
                  ? incomeCategories.length
                  : tab.id === "savings"
                    ? savingsCategories.length
                    : expenseCategories.length +
                      incomeCategories.length +
                      savingsCategories.length;

            return (
              <button
                key={tab.id}
                className={`pill${catTab === tab.id ? " active" : ""}`}
                onClick={() => setCatTab(tab.id)}
              >
                {tab.label}
                <span
                  style={{
                    marginLeft: 6,
                    background:
                      catTab === tab.id
                        ? "rgba(0,0,0,0.2)"
                        : "rgba(255,255,255,0.08)",
                    color:
                      catTab === tab.id ? "#022c22" : "var(--color-text-muted)",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "0 5px",
                    borderRadius: 8,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Savings tab hint */}
        {catTab === "savings" && (
          <div
            style={{
              background: "rgba(167,139,250,0.08)",
              border: "0.5px solid rgba(167,139,250,0.2)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
              fontSize: 12,
              color: "var(--color-text-secondary)",
            }}
          >
            The Savings category is system-managed. Savings contributions are
            recorded from the Savings Goals tab.
          </div>
        )}

        {/* All tab hint */}
        {catTab === "all" && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "0.5px solid rgba(255,255,255,0.07)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            Switch to the Expense or Income tab to add new categories.
          </div>
        )}

        {/* Category list */}
        {activeCats.map((cat) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            onEdit={openEditCat}
            onDelete={handleDeleteCat}
          />
        ))}

        {activeCats.length === 0 && (
          <div className="empty-state" style={{ paddingTop: 32 }}>
            <div className="empty-icon">🏷️</div>
            <div className="empty-title">No categories yet</div>
            <div className="empty-body">Add a category to get started.</div>
          </div>
        )}
      </div>

      {/* ── Bank Balance ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-header">Bank Balance</h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginBottom: 16,
            marginTop: -6,
          }}
        >
          Enter your real bank balance so the app can flag any gap between what
          your records say and what your bank actually holds. The gap that
          formed <em>while you were already tracking</em> is the actionable one.
        </p>

        {/* Row: Tracking start */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <SectionLabel>When Did You Start Tracking?</SectionLabel>
            <input
              type="date"
              className="input"
              value={draftTrackingStartDate}
              onChange={(e) => setDraftTrackingStartDate(e.target.value)}
              style={{ width: "100%" }}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              Date of your first transaction in this app.
            </p>
          </div>
          <div>
            <SectionLabel>Balance at Start</SectionLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              placeholder="e.g. 2500.00"
              value={draftInitialBalance}
              onChange={(e) => setDraftInitialBalance(e.target.value)}
              style={{ width: "100%" }}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              How much you had in the bank on that date. Isolates the active
              gap.
            </p>
          </div>
        </div>

        {/* Row: Current bank balance */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <SectionLabel>Current Bank Balance</SectionLabel>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              placeholder="e.g. 1240.00"
              value={draftBankBalance}
              onChange={(e) => setDraftBankBalance(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <SectionLabel>As of Date</SectionLabel>
            <input
              type="date"
              className="input"
              value={draftBankBalanceDate}
              onChange={(e) => setDraftBankBalanceDate(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Reconciliation preview */}
        {reconciliation && (
          <div
            style={{
              background: "var(--color-bg-input)",
              border: "0.5px solid rgba(255,255,255,0.07)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: 8,
                color: "var(--color-text-secondary)",
                fontSize: 11,
                letterSpacing: "0.6px",
                textTransform: "uppercase",
              }}
            >
              Reconciliation
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>
                App calculates (all-time)
              </span>
              <span
                style={{
                  fontWeight: 500,
                  color:
                    reconciliation.closing >= 0
                      ? "var(--color-income)"
                      : "var(--color-expense)",
                }}
              >
                {reconciliation.closing >= 0 ? "+" : "−"}$
                {Math.abs(reconciliation.closing).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>
                Your bank says
              </span>
              <span
                style={{
                  fontWeight: 500,
                  color:
                    reconciliation.bank >= 0
                      ? "var(--color-income)"
                      : "var(--color-expense)",
                }}
              >
                {reconciliation.bank >= 0 ? "+" : "−"}$
                {Math.abs(reconciliation.bank).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            {reconciliation.activeGap !== null ? (
              <>
                <div
                  style={{
                    height: "0.5px",
                    background: "rgba(255,255,255,0.07)",
                    margin: "8px 0",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: "var(--color-text-muted)" }}>
                    Historical offset (pre-app)
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    $
                    {reconciliation.seed.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{
                      color: "var(--color-text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Active gap (during tracking)
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        Math.abs(reconciliation.activeGap) < 0.01
                          ? "var(--color-income)"
                          : reconciliation.activeGap > 0
                            ? "var(--color-income)"
                            : "var(--color-expense)",
                    }}
                  >
                    {reconciliation.activeGap >= 0 ? "+" : "−"}$
                    {Math.abs(reconciliation.activeGap).toLocaleString(
                      "en-US",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}
                  </span>
                </div>
                {Math.abs(reconciliation.activeGap) < 1 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-income)",
                      marginTop: 6,
                    }}
                  >
                    ✓ Records match your bank
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  style={{
                    height: "0.5px",
                    background: "rgba(255,255,255,0.07)",
                    margin: "8px 0",
                  }}
                />
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{
                      color: "var(--color-text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Full gap
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        reconciliation.fullGap >= 0
                          ? "var(--color-income)"
                          : "var(--color-expense)",
                    }}
                  >
                    {reconciliation.fullGap >= 0 ? "+" : "−"}$
                    {Math.abs(reconciliation.fullGap).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginTop: 6,
                  }}
                >
                  Set a "Balance at Start" above to separate pre-app history
                  from the tracked-period gap.
                </div>
              </>
            )}
          </div>
        )}

        {/* Show gap on dashboard toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                color: "var(--color-text-primary)",
                fontWeight: 500,
              }}
            >
              Show active gap on Dashboard
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginTop: 2,
              }}
            >
              Adds a small "Gap" line to the Balance card so you can see it at a
              glance.
            </div>
          </div>
          <button
            onClick={() => setDraftShowGap((v) => !v)}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              border: "none",
              cursor: "pointer",
              background: draftShowGap
                ? "var(--color-income)"
                : "rgba(255,255,255,0.12)",
              position: "relative",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: draftShowGap ? 20 : 3,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* Monthly reminder */}
        <SectionLabel>Monthly Balance Reminder</SectionLabel>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            Remind me on day
          </span>
          <input
            type="number"
            min="1"
            max="28"
            className="input"
            placeholder="—"
            value={draftReminderDay}
            onChange={(e) => setDraftReminderDay(e.target.value)}
            style={{ width: 72 }}
          />
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            of each month
          </span>
          {draftReminderDay && (
            <button
              className="btn-ghost"
              onClick={() => setDraftReminderDay("")}
              style={{ fontSize: 11 }}
            >
              Clear
            </button>
          )}
        </div>
        <p
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginBottom: 16,
            marginTop: -10,
          }}
        >
          You'll get an in-app notification to check your bank balance. Leave
          blank to disable.
        </p>

        <button className="btn-primary" onClick={handleSaveBankBalance}>
          {balanceSaved ? "✓ Saved" : "Save Bank Balance"}
        </button>
      </div>

      {/* ── Credit Cards ── */}
      <CreditCardSection isDemo={isDemo} />

      {/* ── Data & Export ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-header">Data & Export</h2>

        <SectionLabel>Export</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginBottom: 12,
            marginTop: -6,
          }}
        >
          Download your transactions for the last 3 months. Maximum range per
          export.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn-secondary"
            onClick={() => setShowExportCSV(true)}
          >
            ↓ Export Transactions (.CSV)
          </button>
          <button
            className="btn-secondary"
            onClick={() => setShowExportXML(true)}
          >
            ↓ Export Transactions (.XML)
          </button>
          <button
            className="btn-secondary"
            disabled
            title="PDF monthly reports are coming in a future update"
            style={{ opacity: 0.45, cursor: "not-allowed" }}
          >
            ↓ Monthly Report (PDF) — coming soon
          </button>
        </div>

        <SectionLabel>Import</SectionLabel>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginBottom: 12,
            marginTop: -6,
          }}
        >
          Import bank statements from Bancolombia (XLSX) or any bank (CSV). A
          5-step wizard guides you through mapping, review, and confirmation.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            ↑ Import Bank Statement (CSV / XLSX)
          </button>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div
        style={{
          background: "rgba(239,68,68,0.05)",
          border: "0.5px solid rgba(239,68,68,0.2)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 0,
        }}
      >
        <h2
          className="section-header"
          style={{ color: "var(--color-danger)", marginBottom: 4 }}
        >
          Danger Zone
        </h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginBottom: 16,
          }}
        >
          These actions are irreversible. Proceed with caution.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {DANGER_ACTIONS.map((action) => {
            const isPending = dangerPending === action.id;
            return (
              <div key={action.id}>
                {isPending ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "rgba(239,68,68,0.1)",
                      border: "0.5px solid rgba(239,68,68,0.3)",
                      borderRadius: 8,
                      padding: "8px 14px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      Are you sure?
                    </span>
                    <button
                      style={{
                        background: "var(--color-danger)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                      onClick={confirmDangerAction}
                    >
                      Yes, proceed
                    </button>
                    <button
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--color-text-muted)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                      onClick={cancelDangerAction}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    title={action.description}
                    style={{
                      background: "transparent",
                      border: "0.5px solid rgba(239,68,68,0.4)",
                      color: "var(--color-danger)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(239,68,68,0.1)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                    onClick={() => requestDangerAction(action.id)}
                  >
                    {action.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Category Modal ── */}
      {catModal && (
        <CategoryModal
          initial={catModal.initial}
          isEditing={catModal.mode === "edit"}
          onSave={handleSaveCat}
          onClose={() => setCatModal(null)}
        />
      )}

      {/* ── Export Modals ── */}
      {showExportCSV && (
        <ExportModal
          defaultFormat="csv"
          onClose={() => setShowExportCSV(false)}
        />
      )}
      {showExportXML && (
        <ExportModal
          defaultFormat="xml"
          onClose={() => setShowExportXML(false)}
        />
      )}

      {/* ── Import Wizard ── */}
      {showImport && (
        <ImportWizard
          onClose={() => setShowImport(false)}
          onImportComplete={() => {
            setShowImport(false);
            window.location.reload();
          }}
          categoryGroups={categoryGroups}
        />
      )}
    </>
  );
}
