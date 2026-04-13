/**
 * context/AuthContext.jsx — Global Auth + Demo Mode State
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides three things to every component in the tree:
 *
 *   user       — Supabase user object when logged in, null otherwise
 *   isDemo     — true when the visitor chose "View Demo" on the login page
 *   loading    — true while Supabase is checking the existing session
 *   signIn()   — email/password login via Supabase
 *   signOut()  — signs out and clears demo mode
 *   enterDemo()— sets isDemo = true (called from the login page)
 *
 * ROUTE LOGIC (handled in App.jsx)
 *   loading          → show spinner
 *   !user && !isDemo → show <Login />
 *   user || isDemo   → show the full app shell
 *
 * IS_DEMO IN HOOK FILES
 *   Every hook (useBills, useDebts, etc.) previously read IS_DEMO from the
 *   build-time env var VITE_DEMO_MODE. They now call useAuth().isDemo instead,
 *   which allows the "View Demo" button to work at runtime without a separate
 *   build or deployment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { supabase } from "../api/Auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Restore session on page load ─────────────────────────────────────────
  useEffect(() => {
    // getSession() reads from localStorage — instant, no network call
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Keep user in sync if the session changes in another tab
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Sign in with email + password ────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    setUser(data.user);
    return data.user;
  }, []);

  // ── Sign out ─────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsDemo(false);
  }, []);

  // ── Enter demo mode (no Supabase involved) ───────────────────────────────
  const enterDemo = useCallback(() => {
    setIsDemo(true);
  }, []);

  const value = { user, isDemo, loading, signIn, signOut, enterDemo };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook — call inside any component or custom hook.
 *
 * @returns {{ user, isDemo, loading, signIn, signOut, enterDemo }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be called inside <AuthProvider>");
  return ctx;
}
