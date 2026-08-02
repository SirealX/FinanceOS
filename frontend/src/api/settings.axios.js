/**
 * frontend/src/api/settings.js — Axios wrappers for settings endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 * Categories
 *   getCategories(kind?)          → GET  /categories?kind=
 *   createCategory(data)          → POST /categories
 *   updateCategory(id, data)      → PUT  /categories/:id
 *   deleteCategory(id)            → DELETE /categories/:id
 *   seedCategories()              → POST /categories/seed
 *
 * Preferences
 *   getPreferences()              → GET  /preferences
 *   updatePreferences(data)       → PUT  /preferences
 * ─────────────────────────────────────────────────────────────────────────────
 */

import client from "./client";

// ── Categories ────────────────────────────────────────────────────────────────

export const getCategories = (kind) =>
  client.get("/categories/", { params: kind ? { kind } : {} });

export const createCategory = (data) => client.post("/categories/", data);

export const updateCategory = (id, data) =>
  client.put(`/categories/${id}`, data);

export const deleteCategory = (id) => client.delete(`/categories/${id}`);

export const seedCategories = () => client.post("/categories/seed");

// ── Preferences ───────────────────────────────────────────────────────────────

export const getPreferences = () => client.get("/preferences/");

export const updatePreferences = (data) => client.put("/preferences/", data);

// ── Account (Danger Zone) ────────────────────────────────────────────────────
//   resetMyData()                 → POST /account/reset
//   Wipes this user's transactions/bills/debts/savings/budget/alerts/
//   recurring/earmarked. Keeps login, Preferences, AlertPreferences, and
//   Category rows — see Backend/app/routers/account.py for the full contract.

export const resetMyData = () => client.post("/account/reset");
