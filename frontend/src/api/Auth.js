/**
 * src/api/auth.js — Supabase client singleton
 * ─────────────────────────────────────────────────────────────────────────────
 * Single import point for the Supabase JS client.
 * Imported by AuthContext (for session management) and client.js (for token
 * injection into every axios request).
 *
 * ENVIRONMENT VARIABLES REQUIRED  (add to /frontend/.env)
 *   VITE_SUPABASE_URL       → Supabase Dashboard → Settings → API → Project URL
 *   VITE_SUPABASE_ANON_KEY  → Supabase Dashboard → Settings → API → anon public key
 *
 * NOTE: The anon key is safe to expose in frontend code — it has no special
 * privileges. Row-level access is enforced by your FastAPI user_id filter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[auth.js] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Add them to /frontend/.env",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
