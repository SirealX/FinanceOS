/**
 * pages/SetPassword.jsx — Invited User Password Setup
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown when a user arrives via a Supabase invitation link.
 * Supabase has already exchanged the token and created a session, so the user
 * is technically "signed in" but has no password yet.
 *
 * Flow:
 *   1. User clicks the invitation link in their email
 *   2. Supabase exchanges the token → session created → user lands here
 *   3. User chooses a password → supabase.auth.updateUser() saves it
 *   4. clearPasswordSetup() removes the gate → AppShell renders normally
 *
 * Design follows the FinanceOS design system (same card as Login.jsx).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useAuth } from "../context/Authcontexts";

export default function SetPassword() {
  const { user, updatePassword, clearPasswordSetup, signOut } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const email = user?.email ?? "";

  // Password strength: at least 8 chars
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !loading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
      // Brief success moment, then enter the app
      setTimeout(() => {
        clearPasswordSetup();
      }, 1500);
    } catch (err) {
      setError(err.message ?? "Failed to set password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* Subtle grid background */}
      <div style={styles.grid} aria-hidden="true" />

      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoAccent}>Finance</span>OS
        </div>

        {done ? (
          /* ── Success state ── */
          <div style={styles.successWrap}>
            <div style={styles.successIcon}>✓</div>
            <div style={styles.successTitle}>Password set!</div>
            <p style={styles.successSub}>Taking you to your dashboard…</p>
          </div>
        ) : (
          <>
            <h1 style={styles.heading}>Set your password</h1>
            <p style={styles.sub}>
              You've been invited to{" "}
              <span style={{ color: "#94A3B8" }}>FinanceOS</span>. Choose a
              password to activate your account.
              {email && (
                <>
                  <br />
                  <span style={{ color: "#475569" }}>Signing in as </span>
                  <span style={{ color: "#94A3B8" }}>{email}</span>
                </>
              )}
            </p>

            {/* Error banner */}
            {error && <div style={styles.errorBanner}>{error}</div>}

            <form onSubmit={handleSubmit} style={styles.form}>
              <div className="field-wrap">
                <label className="field-label">New password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={8}
                />
                {tooShort && (
                  <span style={styles.fieldHint}>
                    Must be at least 8 characters
                  </span>
                )}
              </div>

              <div className="field-wrap" style={{ marginTop: 12 }}>
                <label className="field-label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                {mismatch && (
                  <span style={styles.fieldHint}>Passwords don't match</span>
                )}
              </div>

              {/* Password strength bar */}
              {password.length > 0 && (
                <div style={styles.strengthWrap}>
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      style={{
                        ...styles.strengthBar,
                        background: getStrengthColor(password, level),
                      }}
                    />
                  ))}
                  <span style={styles.strengthLabel}>
                    {getStrengthLabel(password)}
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={!canSubmit}
                style={styles.submitBtn}
              >
                {loading ? "Setting password…" : "Activate account →"}
              </button>
            </form>

            {/* Escape hatch */}
            <div style={styles.footer}>
              <span style={styles.footerDot} />
              Wrong account?{" "}
              <button
                onClick={signOut}
                style={styles.footerLink}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Password strength helpers ─────────────────────────────────────────────────

function getStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9!@#$%^&*]/.test(password)) score++;
  return score; // 0–4
}

function getStrengthColor(password, level) {
  const score = getStrength(password);
  if (score === 0) return "rgba(255,255,255,0.06)";
  const colors = ["#EF4444", "#F59E0B", "#10B981", "#10B981"];
  return level <= score ? colors[score - 1] : "rgba(255,255,255,0.06)";
}

function getStrengthLabel(password) {
  const score = getStrength(password);
  return ["", "Weak", "Fair", "Good", "Strong"][score] ?? "";
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0B0D16",
    position: "relative",
    padding: "20px",
  },

  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
    pointerEvents: "none",
  },

  card: {
    position: "relative",
    zIndex: 1,
    background: "#141826",
    border: "0.5px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: "36px 32px 28px",
    width: "100%",
    maxWidth: 400,
  },

  logo: {
    fontSize: 18,
    fontWeight: 600,
    color: "#F1F5F9",
    letterSpacing: "-0.3px",
    marginBottom: 24,
  },

  logoAccent: { color: "#10B981" },

  heading: {
    fontSize: 22,
    fontWeight: 600,
    color: "#F1F5F9",
    letterSpacing: "-0.5px",
    margin: "0 0 8px",
    lineHeight: 1.2,
  },

  sub: {
    fontSize: 13,
    color: "#5E6E85",
    lineHeight: 1.6,
    margin: "0 0 24px",
  },

  errorBanner: {
    background: "rgba(239,68,68,0.1)",
    border: "0.5px solid rgba(239,68,68,0.3)",
    color: "#EF4444",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    fontSize: 13,
  },

  form: {
    display: "flex",
    flexDirection: "column",
  },

  fieldHint: {
    display: "block",
    marginTop: 4,
    fontSize: 11,
    color: "#EF4444",
  },

  strengthWrap: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },

  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    transition: "background 0.2s",
  },

  strengthLabel: {
    fontSize: 11,
    color: "#475569",
    minWidth: 40,
    textAlign: "right",
  },

  submitBtn: {
    marginTop: 20,
    width: "100%",
    padding: "11px 16px",
    fontSize: 14,
    fontWeight: 500,
  },

  footer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingTop: 18,
    borderTop: "0.5px solid rgba(255,255,255,0.06)",
    fontSize: 11,
    color: "#334155",
  },

  footerDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#334155",
    flexShrink: 0,
  },

  footerLink: {
    background: "none",
    border: "none",
    color: "#5E6E85",
    cursor: "pointer",
    fontSize: 11,
    padding: 0,
    textDecoration: "underline",
  },

  // Success state
  successWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "20px 0 8px",
  },

  successIcon: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    background: "rgba(16,185,129,0.15)",
    color: "#10B981",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 600,
  },

  successTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#F1F5F9",
    letterSpacing: "-0.3px",
  },

  successSub: {
    fontSize: 13,
    color: "#5E6E85",
    margin: 0,
  },
};
