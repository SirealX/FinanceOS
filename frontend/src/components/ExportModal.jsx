/**
 * components/ExportModal.jsx — Shared export modal
 * ─────────────────────────────────────────────────────────────────────────────
 * Used from both the Transactions page and the Settings page.
 *
 * Props:
 *   onClose()           Called when the modal should be dismissed
 *   defaultFormat       "csv" | "xml"  (optional, defaults to "csv")
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { exportTransactions } from "../api/export.axios";

export default function ExportModal({ onClose, defaultFormat = "csv" }) {
  const today   = new Date().toISOString().slice(0, 10);
  const minus3m = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [dateFrom, setDateFrom] = useState(minus3m);
  const [dateTo,   setDateTo]   = useState(today);
  const [format,   setFormat]   = useState(defaultFormat);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      await exportTransactions(dateFrom, dateTo, format);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.detail ?? "Export failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{ width: 420, maxWidth: "calc(100vw - 40px)", margin: 0 }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 20,
          }}
        >
          <h2 className="section-header" style={{ margin: 0 }}>
            Export Transactions
          </h2>
          <button
            className="btn-danger"
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {/* Date range */}
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Date Range</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="field-label" style={{ fontSize: 10 }}>From</label>
              <input
                className="input"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 10 }}>To</label>
              <input
                className="input"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Format picker */}
        <div className="field-wrap" style={{ marginBottom: 20 }}>
          <label className="field-label">Format</label>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { value: "csv", label: ".CSV", desc: "Opens in Excel or any spreadsheet app" },
              { value: "xml", label: ".XML", desc: "Structured data for accountants or apps" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 8,
                  border: `1.5px solid ${format === f.value ? "var(--color-income)" : "rgba(255,255,255,0.1)"}`,
                  background: format === f.value ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.02)",
                  color: format === f.value ? "var(--color-income)" : "var(--color-text-secondary)",
                  fontWeight: format === f.value ? 600 : 400,
                  cursor: "pointer", transition: "all 0.15s",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "0.5px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "8px 12px",
              fontSize: 12, color: "var(--color-danger)", marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="form-actions">
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={loading || !dateFrom || !dateTo}
          >
            {loading ? "Generating…" : `↓ Download .${format.toUpperCase()}`}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
