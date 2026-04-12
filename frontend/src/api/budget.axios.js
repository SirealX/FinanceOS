/**
 * frontend/src/api/budget.js — Axios wrappers for budget endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 * getBudgetCategories()           → GET  /budget/categories
 * updateBudgetCategories(cats)    → PUT  /budget/categories  { categories: [...] }
 * getBudgetActuals(period)        → GET  /budget/actuals?period=this_month
 *
 * `period` must be one of:
 *   "this_month" | "last_month" | "last_3_months"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import client from "./client";

export const getBudgetCategories = () =>
  client.get("/budget/categories");

export const updateBudgetCategories = (categories) =>
  client.put("/budget/categories", { categories });

export const getBudgetActuals = (period) =>
  client.get(`/budget/actuals?period=${period}`);
