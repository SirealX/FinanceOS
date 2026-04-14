/**
 * pages/ImportWizard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 5-step bank statement import wizard rendered as a full-screen modal overlay.
 *
 * Step 1 — Upload & Settings
 * Step 2 — Column Mapping
 * Step 3 — Validation Report
 * Step 4 — Transaction Review (one at a time)
 * Step 5 — Final Confirmation
 *
 * Props:
 *   onClose()             Called when the user dismisses the wizard
 *   onImportComplete()    Called after a successful commit (to refresh the tx list)
 *   categoryGroups        Array of { header, options } for the category dropdowns
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useCallback } from "react";
import { parseImportFile, validateImport, commitImport } from "../api/import.axios";

// ── Constants ─────────────────────────────────────────────────────────────────

const BANKS = ["Bancolombia", "Davivienda", "Banco de Bogotá", "BBVA Colombia"];

const DATE_FORMATS = [
  { value: "DD/MM",       label: "DD/MM  (no year — inferred)" },
  { value: "DD/MM/YYYY",  label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY",  label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD",  label: "YYYY-MM-DD" },
];

const DECIMAL_SEPS = [
  { value: ".", label: "Period  — 1,234.56" },
  { value: ",", label: "Comma   — 1.234,56" },
];

const TX_TYPES = ["expense", "income"];

// ── Styles helpers ────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  modal: {
    background: "var(--color-bg-card)",       /* #141826 — design system card bg */
    border: "var(--border-default)",
    borderRadius: 12,                          /* --radius-lg */
    width: "100%",
    maxWidth: 680,
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 24px 16px",
    borderBottom: "var(--border-subtle)",
    position: "sticky", top: 0,
    background: "var(--color-bg-card)",       /* must match modal bg */
    zIndex: 2,
  },
  body: { padding: "20px 24px" },
  footer: {
    display: "flex", justifyContent: "flex-end", gap: 10,
    padding: "16px 24px",
    borderTop: "var(--border-subtle)",
    position: "sticky", bottom: 0,
    background: "var(--color-bg-card)",       /* must match modal bg */
  },
  fieldWrap: { marginBottom: 14 },
  label: {
    display: "block",
    fontSize: 11, fontWeight: 400,
    color: "var(--color-text-hint)",           /* #5E6E85 — matches .field-label */
    marginBottom: 5,
    letterSpacing: "0.5px",
  },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  infoBox: (color = "rgba(16,185,129,0.08)") => ({
    background: color,
    border: `0.5px solid ${color.replace("0.08", "0.2")}`,
    borderRadius: 8, padding: "10px 14px",
    fontSize: 12, color: "var(--color-text-secondary)",
    marginBottom: 14,
  }),
  warnBox: {
    background: "rgba(249,115,22,0.08)",       /* --color-expense opacity */
    border: "0.5px solid rgba(249,115,22,0.2)",
    borderRadius: 8, padding: "10px 14px",
    fontSize: 12, color: "var(--color-expense)",
    marginBottom: 14,
  },
  errBox: {
    background: "rgba(239,68,68,0.08)",
    border: "0.5px solid rgba(239,68,68,0.2)",
    borderRadius: 8, padding: "10px 14px",
    fontSize: 12, color: "var(--color-danger)",
    marginBottom: 14,
  },
  card: {
    background: "var(--color-bg-input)",       /* #1A1F30 — slightly elevated from card */
    border: "var(--border-default)",
    borderRadius: 8, padding: "14px 16px",
    marginBottom: 12,
  },
  reviewReadOnly: {
    background: "var(--color-bg-input)",
    border: "var(--border-subtle)",
    borderRadius: 8, padding: "10px 14px",
    marginBottom: 14,
  },
};

// ── Progress Bar ──────────────────────────────────────────────────────────────

function StepBar({ step }) {
  const steps = ["Upload", "Mapping", "Validate", "Review", "Confirm"];
  return (
    <div style={{ display: "flex", gap: 0, alignItems: "center", marginBottom: 20 }}>
      {steps.map((label, i) => {
        const num   = i + 1;
        const done  = num < step;
        const active = num === step;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600,
                background: done ? "var(--color-income)" : active ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)",
                color: done ? "#022c22" : active ? "var(--color-income)" : "var(--color-text-hint)",
                border: active ? "1.5px solid var(--color-income)" : "1.5px solid transparent",
                transition: "all 0.2s",
              }}>
                {done ? "✓" : num}
              </div>
              <span style={{ fontSize: 10, color: active ? "var(--color-text-primary)" : "var(--color-text-hint)", whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 1,
                background: done ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.07)",
                margin: "0 6px", marginBottom: 14,
                transition: "background 0.2s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Upload & Settings ─────────────────────────────────────────────────

function Step1Upload({ settings, setSettings, onNext, loading, error }) {
  const fileRef  = useRef(null);
  const [drag, setDrag]   = useState(false);
  const [file, setFile]   = useState(null);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setSettings(prev => ({ ...prev, file: f }));
  };

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const canNext = !!settings.file;

  return (
    <div>
      <StepBar step={1} />
      <h3 className="section-header" style={{ margin: "0 0 4px" }}>Upload Bank Statement</h3>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--color-text-hint)" }}>
        Upload your bank export file and confirm the settings below.
      </p>

      {/* Drag & drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? "var(--color-income)" : "rgba(255,255,255,0.15)"}`,
          borderRadius: 12,
          padding: "32px 20px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 18,
          background: drag ? "rgba(16,185,129,0.04)" : "rgba(255,255,255,0.02)",
          transition: "all 0.15s",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
        {settings.file ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>
              {settings.file.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
              {(settings.file.size / 1024).toFixed(0)} KB — click to change
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>Drop file here or click to browse</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
              Accepts .xlsx, .csv (max 5 MB)
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.xml"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Settings */}
      <div style={S.row2}>
        <div style={S.fieldWrap}>
          <label style={S.label}>Bank</label>
          <select className="input" value={settings.bank}
            onChange={e => setSettings(p => ({ ...p, bank: e.target.value }))}>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div style={S.fieldWrap}>
          <label style={S.label}>Date Format</label>
          <select className="input" value={settings.dateFormat}
            onChange={e => setSettings(p => ({ ...p, dateFormat: e.target.value }))}>
            {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ ...S.fieldWrap, width: "calc(50% - 6px)" }}>
        <label style={S.label}>Decimal Separator</label>
        <select className="input" value={settings.decimalSep}
          onChange={e => setSettings(p => ({ ...p, decimalSep: e.target.value }))}>
          {DECIMAL_SEPS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>

      {settings.bank !== "Bancolombia" && (
        <div style={S.warnBox}>
          ⚠ Only Bancolombia has a tested parser. Other banks use generic CSV parsing
          and will require manual column mapping in the next step.
        </div>
      )}

      {error && <div style={S.errBox}>{error}</div>}

      <div style={{ ...S.footer, padding: "16px 0 0", border: "none", position: "static" }}>
        <button className="btn-primary" onClick={() => onNext(settings)} disabled={!canNext || loading}>
          {loading ? "Parsing…" : "Next →"}
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Column Mapping ────────────────────────────────────────────────────

function Step2Mapping({ parseResult, mapping, setMapping, onNext, onBack }) {
  const { columns, rows, bank, account_number, row_count, skipped_count } = parseResult;

  // Build dropdown options from detected raw keys
  const rawKeys = rows.length > 0
    ? Object.keys(rows[0]).filter(k => k !== "_row_index")
    : [];

  const fields = [
    { key: "date",        label: "Date",        required: true },
    { key: "amount",      label: "Amount",      required: true },
    { key: "description", label: "Description", required: true },
    { key: "balance",     label: "Balance After Transaction", required: false },
    { key: "document",    label: "Document / Reference",      required: false },
  ];

  const canNext = mapping.date && mapping.amount && mapping.description;

  const previewRow = rows[0] || {};

  return (
    <div>
      <StepBar step={2} />
      <h3 className="section-header" style={{ margin: "0 0 4px" }}>Column Mapping</h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--color-text-hint)" }}>
        Map each detected column to the correct field. Required fields must be mapped before continuing.
      </p>

      <div style={S.infoBox()}>
        <strong>{bank}</strong>
        {account_number && ` — Account ${account_number}`}
        {" · "}
        {row_count} rows detected
        {skipped_count > 0 && `, ${skipped_count} empty rows skipped`}
      </div>

      {fields.map(({ key, label, required }) => (
        <div key={key} style={S.row2}>
          <div style={S.fieldWrap}>
            <label style={S.label}>
              {label}
              {required && <span style={{ color: "var(--color-danger)", marginLeft: 4 }}>*</span>}
            </label>
            <select className="input" value={mapping[key] || ""}
              onChange={e => setMapping(p => ({ ...p, [key]: e.target.value || null }))}>
              <option value="">{required ? "— select column —" : "— not mapped —"}</option>
              {rawKeys.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div style={{ ...S.fieldWrap, display: "flex", alignItems: "flex-end" }}>
            {mapping[key] && previewRow[mapping[key]] !== undefined && (
              <div style={{
                fontSize: 11, padding: "7px 10px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 6, color: "var(--color-text-secondary)",
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                Preview: <strong>{String(previewRow[mapping[key]])}</strong>
              </div>
            )}
          </div>
        </div>
      ))}

      <div style={{ ...S.footer, padding: "16px 0 0", border: "none", position: "static" }}>
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn-primary" onClick={onNext} disabled={!canNext}>
          Next →
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Validation Report ─────────────────────────────────────────────────

function Step3Validation({ validateResult, onNext, onBack, loading, error }) {
  const { valid_count, error_count, duplicate_count, date_from, date_to, warnings, error_rows, duplicates } = validateResult || {};

  const [dupAcknowledged, setDupAcknowledged] = useState(false);

  const hasErrors = error_count > 0;
  const hasDups   = duplicate_count > 0 && !dupAcknowledged;
  const canNext   = !hasDups || dupAcknowledged;

  return (
    <div>
      <StepBar step={3} />
      <h3 className="section-header" style={{ margin: "0 0 4px" }}>Validation Report</h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--color-text-hint)" }}>
        Review the results before proceeding to transaction review.
      </p>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Ready to import", value: valid_count, color: "var(--color-income)" },
          { label: "Rows with errors", value: error_count, color: error_count > 0 ? "var(--color-danger)" : "var(--color-text-muted)" },
          { label: "Possible duplicates", value: duplicate_count, color: duplicate_count > 0 ? "var(--color-expense)" : "var(--color-text-muted)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...S.card, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{value ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {date_from && date_to && (
        <div style={S.infoBox()}>
          Date range: <strong>{date_from}</strong> → <strong>{date_to}</strong>
        </div>
      )}

      {warnings?.map((w, i) => (
        <div key={i} style={S.warnBox}>⚠ {w}</div>
      ))}

      {hasErrors && error_rows?.length > 0 && (
        <div style={{ ...S.errBox, maxHeight: 140, overflowY: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Rows with errors (will be skipped):</div>
          {error_rows.slice(0, 10).map((r) => (
            <div key={r._row_index} style={{ marginBottom: 4 }}>
              Row {r._row_index}: {r.errors.join(" · ")}
            </div>
          ))}
          {error_rows.length > 10 && <div>…and {error_rows.length - 10} more</div>}
        </div>
      )}

      {duplicate_count > 0 && (
        <div style={S.warnBox}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            ⚠ {duplicate_count} possible duplicate{duplicate_count > 1 ? "s" : ""} detected
          </div>
          <div style={{ marginBottom: 8, fontSize: 11 }}>
            These transactions appear similar to ones already in your account.
            They will still appear in the review step — you decide whether to import them.
          </div>
          {duplicates?.slice(0, 3).map((d) => (
            <div key={d._row_index} style={{ marginBottom: 3, fontSize: 11 }}>
              Row {d._row_index}: {d.reason}
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={dupAcknowledged} onChange={e => setDupAcknowledged(e.target.checked)} />
            <span style={{ fontSize: 12 }}>I understand — continue to review</span>
          </label>
        </div>
      )}

      {error && <div style={S.errBox}>{error}</div>}

      {valid_count === 0 && !loading && (
        <div style={S.errBox}>
          No valid rows to import. Please check your column mapping and file format.
        </div>
      )}

      <div style={{ ...S.footer, padding: "16px 0 0", border: "none", position: "static" }}>
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button
          className="btn-primary"
          onClick={onNext}
          disabled={loading || !valid_count || (duplicate_count > 0 && !dupAcknowledged)}
        >
          {loading ? "Loading…" : `Review ${valid_count} Transactions →`}
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Transaction Review ────────────────────────────────────────────────

function Step4Review({ validRows, reviewed, setReviewed, onNext, onBack, categoryGroups }) {
  const [cursor, setCursor] = useState(0);
  const [filterDesc, setFilterDesc] = useState("");
  const [filterAmtMin, setFilterAmtMin] = useState("");
  const [filterAmtMax, setFilterAmtMax] = useState("");

  // Apply filters to get the subset being reviewed
  const filteredIndices = validRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => {
      if (filterDesc && !r.description.toLowerCase().includes(filterDesc.toLowerCase())) return false;
      if (filterAmtMin && r.amount < parseFloat(filterAmtMin)) return false;
      if (filterAmtMax && r.amount > parseFloat(filterAmtMax)) return false;
      return true;
    })
    .map(({ i }) => i);

  const currentOriginalIndex = filteredIndices[cursor] ?? -1;
  const current = currentOriginalIndex >= 0 ? validRows[currentOriginalIndex] : null;
  const currentReview = current ? (reviewed[currentOriginalIndex] || {}) : {};

  const completedCount = Object.keys(reviewed).filter(i => {
    const r = reviewed[i];
    return r?.type && r?.category;
  }).length;

  const allDone = completedCount === validRows.length;

  function updateCurrent(patch) {
    if (currentOriginalIndex < 0) return;
    setReviewed(prev => ({
      ...prev,
      [currentOriginalIndex]: { ...prev[currentOriginalIndex], ...patch },
    }));
  }

  function handleNext() {
    if (cursor < filteredIndices.length - 1) setCursor(c => c + 1);
  }
  function handlePrev() {
    if (cursor > 0) setCursor(c => c - 1);
  }

  // Derive default type from amount sign (positive = income, negative = expense)
  const defaultType = current?.is_credit ? "income" : "expense";

  const txType     = currentReview.type     ?? current?.suggested_type     ?? defaultType;
  const txCategory = currentReview.category ?? current?.suggested_category ?? "";
  const txNotes    = currentReview.notes ?? "";
  const txMethod   = currentReview.payment_method ?? "";

  // Category options based on selected type
  const catOptions = categoryGroups
    ? categoryGroups
        .filter(g => {
          const gLabel = g.header.toLowerCase();
          if (txType === "income")  return gLabel.includes("income");
          return gLabel.includes("expense");
        })
        .flatMap(g => g.options)
    : [];

  const canProceed = allDone;

  const fmt = (n) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <StepBar step={4} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <h3 className="section-header" style={{ margin: "0 0 4px" }}>Transaction Review</h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-hint)" }}>
            Classify each transaction before importing.
          </p>
        </div>
        <div style={{ fontSize: 12, color: completedCount === validRows.length ? "var(--color-income)" : "var(--color-text-muted)", textAlign: "right" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text-primary)" }}>{completedCount}</span>
          <span style={{ color: "var(--color-text-muted)" }}> / {validRows.length} done</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input className="input" placeholder="Filter by description…" value={filterDesc}
          onChange={e => { setFilterDesc(e.target.value); setCursor(0); }}
          style={{ flex: 2, fontSize: 12, padding: "6px 10px" }} />
        <input className="input" type="number" placeholder="Min $" value={filterAmtMin}
          onChange={e => { setFilterAmtMin(e.target.value); setCursor(0); }}
          style={{ width: 90, fontSize: 12, padding: "6px 10px" }} />
        <input className="input" type="number" placeholder="Max $" value={filterAmtMax}
          onChange={e => { setFilterAmtMax(e.target.value); setCursor(0); }}
          style={{ width: 90, fontSize: 12, padding: "6px 10px" }} />
        {(filterDesc || filterAmtMin || filterAmtMax) && (
          <button className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={() => { setFilterDesc(""); setFilterAmtMin(""); setFilterAmtMax(""); setCursor(0); }}>
            Clear
          </button>
        )}
      </div>

      {filteredIndices.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: "var(--color-text-muted)", fontSize: 12, padding: 24 }}>
          No transactions match the current filter.
        </div>
      )}

      {current && (
        <>
          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button className="btn-secondary" onClick={handlePrev} disabled={cursor === 0}
              style={{ fontSize: 12, padding: "4px 12px" }}>← Prev</button>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {cursor + 1} of {filteredIndices.length}
              {filteredIndices.length < validRows.length && ` (filtered)`}
            </span>
            <button className="btn-secondary" onClick={handleNext} disabled={cursor === filteredIndices.length - 1}
              style={{ fontSize: 12, padding: "4px 12px" }}>Next →</button>
          </div>

          {/* Read-only file data */}
          <div style={S.reviewReadOnly}>
            <div style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-hint)", marginBottom: 8, letterSpacing: "0.5px" }}>
              FROM YOUR FILE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
              <div><span style={{ color: "var(--color-text-muted)" }}>Date: </span><strong>{current.date}</strong></div>
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Amount: </span>
                <strong style={{ color: current.is_credit ? "var(--color-income)" : "var(--color-expense)" }}>
                  {current.is_credit ? "+" : "−"}{fmt(current.amount)}
                </strong>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Description: </span>
                <strong>{current.description}</strong>
              </div>
              {current.balance_after != null && (
                <div><span style={{ color: "var(--color-text-muted)" }}>Balance after: </span><strong>{fmt(current.balance_after)}</strong></div>
              )}
            </div>
            {current.is_potential_dup && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-expense)" }}>
                ⚠ Possible duplicate — review carefully
              </div>
            )}
          </div>

          {/* Editable fields */}
          <div style={S.row2}>
            <div style={S.fieldWrap}>
              <label style={S.label}>Type <span style={{ color: "var(--color-danger)" }}>*</span></label>
              <select className="input" value={txType}
                onChange={e => updateCurrent({ type: e.target.value, category: "" })}>
                {TX_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div style={S.fieldWrap}>
              <label style={S.label}>Category <span style={{ color: "var(--color-danger)" }}>*</span></label>
              <select className="input" value={txCategory}
                onChange={e => updateCurrent({ category: e.target.value })}>
                <option value="">— select category —</option>
                {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={S.fieldWrap}>
            <label style={S.label}>Notes <span style={{ color: "var(--color-text-muted)" }}>(optional)</span></label>
            <input className="input" placeholder="Optional note…" value={txNotes}
              onChange={e => updateCurrent({ notes: e.target.value })} />
          </div>

          {/* Auto-apply to save time: mark current as done and advance */}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              className="btn-secondary"
              style={{ fontSize: 12, flex: 1 }}
              disabled={!txType || !txCategory}
              onClick={() => {
                updateCurrent({ type: txType, category: txCategory, notes: txNotes, payment_method: txMethod });
                if (cursor < filteredIndices.length - 1) setCursor(c => c + 1);
              }}
            >
              {cursor < filteredIndices.length - 1 ? "Save & Next →" : "Save"}
            </button>
          </div>
        </>
      )}

      {!allDone && validRows.length > 0 && (
        <div style={{ ...S.warnBox, marginTop: 14 }}>
          {validRows.length - completedCount} transaction{validRows.length - completedCount > 1 ? "s" : ""} still need
          a type and category before you can proceed.
        </div>
      )}

      <div style={{ ...S.footer, padding: "16px 0 0", border: "none", position: "static" }}>
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn-primary" onClick={onNext} disabled={!canProceed}>
          Review Summary →
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Final Confirmation ────────────────────────────────────────────────

function Step5Confirm({ validRows, reviewed, onCommit, onBack, loading, error, result }) {
  if (result) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0 24px" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(16,185,129,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, margin: "0 auto 16px",
        }}>✓</div>
        <h3 className="section-header" style={{ justifyContent: "center", margin: "0 0 8px" }}>
          Import Complete
        </h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, marginBottom: 4 }}>
          {result.message}
        </p>
        <p style={{ color: "var(--color-text-hint)", fontSize: 12 }}>
          {result.date_from} → {result.date_to}
        </p>
      </div>
    );
  }

  // Build summary
  const byType = {};
  const allTx = validRows.map((r, i) => ({ ...r, ...reviewed[i] }));
  for (const tx of allTx) {
    const t = tx.type || "expense";
    if (!byType[t]) byType[t] = { count: 0, total: 0 };
    byType[t].count++;
    byType[t].total += tx.amount;
  }

  const dates = validRows.map(r => r.date).sort();
  const dateFrom = dates[0];
  const dateTo   = dates[dates.length - 1];

  const fmt = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <StepBar step={5} />
      <h3 className="section-header" style={{ margin: "0 0 4px" }}>Confirm Import</h3>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--color-text-hint)" }}>
        Review the summary below, then click <strong>Confirm Import</strong> to save all transactions.
        This action cannot be undone.
      </p>

      <div style={S.infoBox()}>
        <div style={{ marginBottom: 4 }}>
          <strong>{validRows.length}</strong> transaction{validRows.length !== 1 ? "s" : ""} to be imported
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {dateFrom} → {dateTo}
        </div>
      </div>

      {Object.entries(byType).map(([type, { count, total }]) => (
        <div key={type} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, marginRight: 8,
              background: type === "income" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)",
              color: type === "income" ? "var(--color-income)" : "var(--color-expense)",
            }}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
            {count} transaction{count !== 1 ? "s" : ""}
          </div>
          <div style={{ fontWeight: 600, color: type === "income" ? "var(--color-income)" : "var(--color-text-primary)" }}>
            {fmt(total)}
          </div>
        </div>
      ))}

      {error && <div style={S.errBox}>{error}</div>}

      <div style={{ ...S.footer, padding: "16px 0 0", border: "none", position: "static" }}>
        <button className="btn-secondary" onClick={onBack} disabled={loading}>← Back</button>
        <button className="btn-primary" onClick={onCommit} disabled={loading}>
          {loading ? "Importing…" : `✓ Confirm Import (${validRows.length})`}
        </button>
      </div>
    </div>
  );
}

// ── Main ImportWizard ─────────────────────────────────────────────────────────

export default function ImportWizard({ onClose, onImportComplete, categoryGroups }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1 state
  const [settings, setSettings] = useState({
    file: null,
    bank: "Bancolombia",
    dateFormat: "DD/MM",
    decimalSep: ".",
  });

  // Step 2 state (parse result + mapping)
  const [parseResult, setParseResult] = useState(null);
  const [mapping, setMapping] = useState({
    date: "raw_date", amount: "raw_amount", description: "raw_desc",
    balance: "raw_balance", document: "raw_doc",
  });

  // Step 3 state
  const [validateResult, setValidateResult] = useState(null);

  // Step 4 state
  const [reviewed, setReviewed] = useState({});

  // Step 5 state
  const [commitResult, setCommitResult] = useState(null);

  // ── Step 1 → 2: Parse the file ────────────────────────────────────────────
  async function handleParse(s) {
    setLoading(true); setError(null);
    try {
      const res = await parseImportFile(s.file, s.bank);
      const data = res.data;
      setParseResult(data);
      // Pre-fill mapping from suggested_mapping if available
      if (data.suggested_mapping) {
        const sm = data.suggested_mapping;
        setMapping({
          date:        sm.date        || "raw_date",
          amount:      sm.amount      || "raw_amount",
          description: sm.description || "raw_desc",
          balance:     sm.balance     || "raw_balance",
          document:    sm.document    || "raw_doc",
        });
      }
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not parse the file. Check the format and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2 → 3: Validate mapping ─────────────────────────────────────────
  async function handleValidate() {
    setLoading(true); setError(null);
    try {
      const res = await validateImport({
        bank:           settings.bank,
        date_format:    settings.dateFormat,
        decimal_sep:    settings.decimalSep,
        column_mapping: mapping,
        rows:           parseResult.rows,
      });
      setValidateResult(res.data);
      // Pre-fill review with suggested type/category from parser
      const prefilled = {};
      res.data.valid_rows.forEach((row, i) => {
        prefilled[i] = {
          type:     row.suggested_type     || (row.is_credit ? "income" : "expense"),
          category: row.suggested_category || "",
          notes:    "",
        };
      });
      setReviewed(prefilled);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || "Validation failed. Please check your column mapping.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4 → 5 ────────────────────────────────────────────────────────────
  function handleGoToConfirm() {
    setStep(5);
  }

  // ── Step 5: Commit ────────────────────────────────────────────────────────
  async function handleCommit() {
    setLoading(true); setError(null);
    const validRows = validateResult?.valid_rows || [];
    const txs = validRows.map((row, i) => {
      const rev = reviewed[i] || {};
      return {
        date:           row.date,
        amount:         row.amount,
        description:    row.description,
        balance_after:  row.balance_after ?? null,
        document:       row.document ?? null,
        type:           rev.type || (row.is_credit ? "income" : "expense"),
        category:       rev.category || "Other",
        notes:          rev.notes || null,
        payment_method: rev.payment_method || null,
      };
    });
    try {
      const res = await commitImport(txs);
      setCommitResult(res.data);
      setTimeout(() => {
        onImportComplete?.();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || "Import failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
              Import Transactions
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-hint)", marginLeft: 10 }}>
              Step {step} of 5
            </span>
          </div>
          <button
            className="btn-danger"
            onClick={onClose}
            disabled={loading}
            style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {step === 1 && (
            <Step1Upload
              settings={settings}
              setSettings={setSettings}
              onNext={handleParse}
              loading={loading}
              error={error}
            />
          )}
          {step === 2 && parseResult && (
            <Step2Mapping
              parseResult={parseResult}
              mapping={mapping}
              setMapping={setMapping}
              onNext={handleValidate}
              onBack={() => setStep(1)}
              loading={loading}
            />
          )}
          {step === 3 && validateResult && (
            <Step3Validation
              validateResult={validateResult}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
              loading={loading}
              error={error}
            />
          )}
          {step === 4 && validateResult && (
            <Step4Review
              validRows={validateResult.valid_rows}
              reviewed={reviewed}
              setReviewed={setReviewed}
              onNext={handleGoToConfirm}
              onBack={() => setStep(3)}
              categoryGroups={categoryGroups}
            />
          )}
          {step === 5 && validateResult && (
            <Step5Confirm
              validRows={validateResult.valid_rows}
              reviewed={reviewed}
              onCommit={handleCommit}
              onBack={() => setStep(4)}
              loading={loading}
              error={error}
              result={commitResult}
            />
          )}
        </div>
      </div>
    </div>
  );
}
