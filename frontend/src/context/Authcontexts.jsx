/**
 * context/AuthContext.jsx — Global Auth + Demo Mode State
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides the following to every component in the tree:
 *
 *   user                — Supabase user object when logged in, null otherwise
 *   isDemo              — true when the visitor chose "View Demo" on the login page
 *   loading             — true while Supabase is checking the existing session
 *   needsPasswordSetup  — true when user arrived via an invitation link
 *   signIn()            — email/password login via Supabase
 *   signOut()           — signs out and clears demo mode
 *   enterDemo()         — sets isDemo = true (called from the login page)
 *   updatePassword()    — called by invited users to set their first password
 *   clearPasswordSetup()— called after password is set to enter the app normally
 *
 * ROUTE LOGIC (handled in App.jsx)
 *   loading                      → show spinner
 *   !user && !isDemo             → show <Login />
 *   user && needsPasswordSetup   → show <SetPassword />
 *   user || isDemo               → show the full app shell
 *
 * INVITATION FLOW
 *   Supabase invitation emails contain a link with #type=invite in the URL hash.
 *   The Supabase JS client automatically exchanges the token for a session and
 *   fires onAuthStateChange with event SIGNED_IN. We detect the original hash
 *   before the browser clears it to set needsPasswordSetup = true, which routes
 *   the user to the <SetPassword /> page where they choose their password.
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

/**
 * Read the `type` param from the URL hash fragment (#access_token=...&type=invite).
 * We must capture this BEFORE Supabase (or React) strips it from the URL.
 * Called once synchronously at module evaluation time so it is never missed.
 */
function getHashType() {
  try {
    const hash = window.location.hash.slice(1); // remove leading #
    const params = new URLSearchParams(hash);
    return params.get("type"); // "invite" | "recovery" | "signup" | null
  } catch {
    return null;
  }
}

// Capture hash type immediately (before any re-renders or hash clearing)
const INITIAL_HASH_TYPE = getHashType();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  // True when the user arrived via an invite or password-recovery link
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(
    INITIAL_HASH_TYPE === "invite" || INITIAL_HASH_TYPE === "recovery",
  );

  // ── Restore session on page load ─────────────────────────────────────────
  useEffect(() => {
    // getSession() reads from localStorage — instant, no network call
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Keep user in sync if the session changes in another tab or after
    // Supabase exchanges the invitation token in the URL hash.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // If Supabase fires PASSWORD_RECOVERY we also need the setup screen
      if (event === "PASSWORD_RECOVERY") {
        setNeedsPasswordSetup(true);
      }
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
    setNeedsPasswordSetup(false);
  }, []);

  // ── Enter demo mode (no Supabase involved) ───────────────────────────────
  const enterDemo = useCallback(() => {
    setIsDemo(true);
  }, []);

  // ── Set password for invited / recovering users ───────────────────────────
  const updatePassword = useCallback(async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
    return data.user;
  }, []);

  // ── Called after password is set — remove the setup gate ─────────────────
  const clearPasswordSetup = useCallback(() => {
    setNeedsPasswordSetup(false);
    // Clean the hash from the URL so a refresh doesn't re-trigger the flow
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const value = {
    user,
    isDemo,
    loading,
    needsPasswordSetup,
    signIn,
    signOut,
    enterDemo,
    updatePassword,
    clearPasswordSetup,
  };

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
