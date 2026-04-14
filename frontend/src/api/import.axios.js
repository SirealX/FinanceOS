/**
 * api/import.axios.js — Import wizard API wrappers
 * ─────────────────────────────────────────────────────────────────────────────
 * Three calls mirror the three backend steps:
 *   parseImportFile   → POST /transactions/import/parse   (multipart)
 *   validateImport    → POST /transactions/import/validate (JSON)
 *   commitImport      → POST /transactions/import/commit  (JSON)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import client from "./client";

/**
 * Step 1 — Upload a bank statement file.
 * @param {File} file      The File object from a file input / drag-drop.
 * @param {string} bank    Bank name e.g. "Bancolombia"
 * @returns {Promise}      Axios response with { columns, suggested_mapping, rows, ... }
 */
export function parseImportFile(file, bank = "Bancolombia") {
  const form = new FormData();
  form.append("file", file);
  form.append("bank", bank);

  return client.post("/transactions/import/parse", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30_000,
  });
}

/**
 * Step 2 — Validate mapped rows and check for duplicates.
 * @param {object} payload  { bank, date_format, decimal_sep, column_mapping, rows }
 * @returns {Promise}       Axios response with { valid_rows, error_rows, duplicates, ... }
 */
export function validateImport(payload) {
  return client.post("/transactions/import/validate", payload, {
    timeout: 20_000,
  });
}

/**
 * Step 3 — Commit all reviewed transactions to the database.
 * @param {Array} transactions  Reviewed & categorised transaction objects.
 * @returns {Promise}           Axios response with { imported_count, date_from, date_to }
 */
export function commitImport(transactions) {
  return client.post("/transactions/import/commit", { transactions }, {
    timeout: 30_000,
  });
}
