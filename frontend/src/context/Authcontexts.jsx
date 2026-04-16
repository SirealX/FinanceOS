/**
 * context/AuthContext.jsx
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

function getHashType() {
  try {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    return params.get("type");
  } catch {
    return null;
  }
}

const INITIAL_HASH_TYPE = getHashType();
const IS_INVITE_FLOW =
  INITIAL_HASH_TYPE === "invite" || INITIAL_HASH_TYPE === "recovery";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(IS_INVITE_FLOW);
  const [inviteLinkExpired, setInviteLinkExpired] = useState(false);

  useEffect(() => {
    let settled = false;

    function settle(sessionUser) {
      if (settled) return;
      settled = true;
      setUser(sessionUser ?? null);
      setLoading(false);
    }

    if (IS_INVITE_FLOW) {
      const timeout = setTimeout(() => {
        if (!settled) {
          setInviteLinkExpired(true);
          settle(null);
        }
      }, 5000);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        clearTimeout(timeout);
        if (event === "PASSWORD_RECOVERY") setNeedsPasswordSetup(true);
        settle(session?.user);
      });

      return () => {
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      settle(session?.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setNeedsPasswordSetup(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsDemo(false);
    setNeedsPasswordSetup(false);
  }, []);

  const enterDemo = useCallback(() => {
    setIsDemo(true);
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
    return data.user;
  }, []);

  const clearPasswordSetup = useCallback(() => {
    setNeedsPasswordSetup(false);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const value = {
    user,
    isDemo,
    loading,
    needsPasswordSetup,
    inviteLinkExpired,
    signIn,
    signOut,
    enterDemo,
    updatePassword,
    clearPasswordSetup,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be called inside <AuthProvider>");
  return ctx;
}
