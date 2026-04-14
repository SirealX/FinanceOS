/**
 * api/export.axios.js — Export API wrapper
 * ─────────────────────────────────────────────────────────────────────────────
 * Requests a CSV or XML file from the backend and triggers a browser download.
 * The file is streamed directly from the backend — never stored server-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import client from "./client";

/**
 * Export transactions for the given date range and trigger a browser download.
 *
 * @param {string} dateFrom  ISO date "YYYY-MM-DD"
 * @param {string} dateTo    ISO date "YYYY-MM-DD"
 * @param {string} format    "csv" | "xml"
 * @returns {Promise<void>}
 */
export async function exportTransactions(dateFrom, dateTo, format = "csv") {
  const response = await client.get("/transactions/export", {
    params: { date_from: dateFrom, date_to: dateTo, format },
    responseType: "blob",
    timeout: 30_000,
  });

  // ── Trigger browser download ───────────────────────────────────────────────
  const mimeType = format === "xml" ? "application/xml" : "text/csv";
  const blob     = new Blob([response.data], { type: mimeType });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement("a");

  a.href     = url;
  a.download = `transactions_${dateFrom}_${dateTo}.${format}`;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
