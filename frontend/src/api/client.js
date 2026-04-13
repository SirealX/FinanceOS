/**
 * api/client.js — Axios instance with auth interceptor
 * ─────────────────────────────────────────────────────────────────────────────
 * The request interceptor reads the current Supabase session token and
 * attaches it as a Bearer token on every API call. This is the only place
 * that needs to change — all other axios calls import this client and
 * automatically get the token.
 *
 * Demo mode: when the user chose "View Demo" on the login page, isDemo is
 * true in AuthContext and the hooks return MockData before making any API
 * calls, so the interceptor is never actually reached in demo mode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from "axios";
import { supabase } from "./Auth";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request interceptor — inject JWT ─────────────────────────────────────────
client.interceptors.request.use(
  async (config) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor — handle token expiry ───────────────────────────────
// Supabase auto-refreshes tokens, but if a 401 slips through after refresh
// has failed (e.g. the user was removed), sign them out cleanly.
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Let the component show an error — don't force-redirect here
      // because some 401s are expected (e.g. wrong password attempt).
      // The AuthContext onAuthStateChange will handle true session expiry.
      console.warn("[client.js] 401 received — token may have expired.");
    }
    return Promise.reject(error);
  },
);

export default client;
