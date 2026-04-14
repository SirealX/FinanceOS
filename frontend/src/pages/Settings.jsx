/**
 * Settings.jsx — Presentation Layer
 */

import { useState } from "react";

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

// ── Settings — default export ─────────────────────────────────────────────────

export default function Settings() {
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
  } = useSettingsPage();

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
  const [showImport,    setShowImport]    = useState(false);

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
          Download your transactions for the last 3 months. Maximum range per export.
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={() => setShowExportCSV(true)}>
            ↓ Export Transactions (.CSV)
          </button>
          <button className="btn-secondary" onClick={() => setShowExportXML(true)}>
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
          Import bank statements from Bancolombia (XLSX) or any bank (CSV).
          A 5-step wizard guides you through mapping, review, and confirmation.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn-secondary"
            onClick={() => setShowImport(true)}
          >
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
