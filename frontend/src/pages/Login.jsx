/**
 * pages/Login.jsx — Entry Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown to any visitor who is not authenticated and has not chosen demo mode.
 * Two clear paths:
 *   1. Log In   — email + password via Supabase Auth
 *   2. View Demo — enters demo mode with MockData, no account needed
 *
 * Design follows the FinanceOS design system (DESIGN_SYSTEM.md):
 *   • Dark base (#0B0D16), card surface (#141826)
 *   • Green primary CTA (#10B981)
 *   • System font stack, tight letter-spacing on headings
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useAuth } from "../context/Authcontexts";

export default function Login() {
  const { signIn, enterDemo } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      // AuthContext updates user → App.jsx re-renders → shell shown
    } catch (err) {
      setError(err.message ?? "Sign in failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* ── Subtle grid background ── */}
      <div style={styles.grid} aria-hidden="true" />

      {/* ── Card ── */}
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoAccent}>Finance</span>OS
        </div>

        <h1 style={styles.heading}>Your finances, organised.</h1>
        <p style={styles.sub}>
          A personal finance tool built to track income, expenses, bills, debts,
          and savings goals — all in one place.
        </p>

        {/* ── Error banner ── */}
        {error && <div style={styles.errorBanner}>{error}</div>}

        {/* ── Login form — shown after "Log In" is clicked ── */}
        {showForm ? (
          <form onSubmit={handleSignIn} style={styles.form}>
            <div className="field-wrap">
              <label className="field-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="field-wrap" style={{ marginTop: 12 }}>
              <label className="field-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div style={styles.formActions}>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
                style={{ flex: 1 }}
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          /* ── Two-option landing ── */
          <div style={styles.options}>
            {/* Primary: registered users */}
            <button
              className="btn-primary"
              style={styles.optionBtn}
              onClick={() => setShowForm(true)}
            >
              <svg
                viewBox="0 0 15 15"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                style={{ flexShrink: 0 }}
              >
                <circle cx="7.5" cy="5" r="2.5" />
                <path d="M2 13c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
              </svg>
              Log In
            </button>

            {/* Divider */}
            <div style={styles.divider}>
              <div style={styles.dividerLine} />
              <span style={styles.dividerText}>or</span>
              <div style={styles.dividerLine} />
            </div>

            {/* Secondary: public demo */}
            <button
              className="btn-secondary"
              style={styles.optionBtn}
              onClick={enterDemo}
            >
              <svg
                viewBox="0 0 15 15"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                style={{ flexShrink: 0 }}
              >
                <path d="M1.5 7.5h12M8 2l5.5 5.5L8 13" />
              </svg>
              Explore the Demo
            </button>

            {/* Demo disclaimer */}
            <p style={styles.disclaimer}>
              The demo uses sample data. No account required and nothing is
              saved.
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerDot} />
          Access is by invitation only. Contact the administrator to request an
          account.
        </div>
      </div>
    </div>
  );
}

// ── Inline styles (avoids touching global.css) ────────────────────────────────

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

  // Subtle dot-grid texture
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

  logoAccent: {
    color: "#10B981",
  },

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
    margin: "0 0 28px",
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

  formActions: {
    display: "flex",
    gap: 8,
    marginTop: 20,
  },

  options: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },

  optionBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "11px 16px",
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 10,
  },

  divider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "14px 0",
  },

  dividerLine: {
    flex: 1,
    height: "0.5px",
    background: "rgba(255,255,255,0.07)",
  },

  dividerText: {
    fontSize: 11,
    color: "#475569",
    letterSpacing: "0.5px",
  },

  disclaimer: {
    fontSize: 11,
    color: "#475569",
    textAlign: "center",
    margin: "10px 0 0",
    lineHeight: 1.5,
  },

  footer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 28,
    paddingTop: 20,
    borderTop: "0.5px solid rgba(255,255,255,0.06)",
    fontSize: 11,
    color: "#334155",
    lineHeight: 1.5,
  },

  footerDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#334155",
    flexShrink: 0,
  },
};
