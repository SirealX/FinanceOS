/**
 * components/OnboardingWizard.jsx
 *
 * 3-step first-run modal shown to new users who have set a display name but
 * haven't configured a starting balance yet.
 *
 * Step 1 — Starting balance  → PATCH /preferences  (initial_balance)
 * Step 2 — Monthly income    → PUT   /budget/categories  (income kind)
 * Step 3 — Done              → calls props.onComplete to dismiss
 *
 * The modal is intentionally unblockable — users can skip both data-entry
 * steps and click "Done" to proceed with defaults.
 *
 * Props:
 *   onComplete: () => void — called when the wizard is dismissed (step 3 Done).
 */

import { useState } from "react";
import { useSettings } from "../context/SettingsContext";
import client from "../api/client";

// ── Total steps ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

// ── Pill progress indicator ───────────────────────────────────────────────────

function StepDots({ current }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 24 }}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? 18 : 6,
            height: 6,
            borderRadius: 3,
            background: i + 1 <= current ? "#10B981" : "rgba(255,255,255,0.12)",
            transition: "width 0.25s, background 0.25s",
          }}
        />
      ))}
    </div>
  );
}

// ── Shared modal shell ────────────────────────────────────────────────────────

function ModalShell({ children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#141826",
          border: "0.5px solid rgba(255,255,255,0.09)",
          borderRadius: 18,
          padding: "32px 28px 26px",
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Title / body helpers ──────────────────────────────────────────────────────

function Title({ children }) {
  return (
    <div
      style={{
        fontSize: 18,
        fontWeight: 600,
        color: "#F1F5F9",
        marginBottom: 8,
        letterSpacing: "-0.3px",
      }}
    >
      {children}
    </div>
  );
}

function Body({ children }) {
  return (
    <p
      style={{
        fontSize: 13,
        color: "#5E6E85",
        lineHeight: 1.6,
        margin: "0 0 22px",
      }}
    >
      {children}
    </p>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--color-danger, #EF4444)",
        marginTop: -12,
        marginBottom: 14,
      }}
    >
      {msg}
    </div>
  );
}

// ── Step 1: Starting balance ──────────────────────────────────────────────────

function Step1({ onNext, onSkip }) {
  const { updatePreferences } = useSettings();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      setError("Please enter a valid amount (0 or above).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePreferences({ initialBalance: num });
      onNext();
    } catch {
      setError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Title>📊 Set your starting balance</Title>
      <Body>
        What was in your account when you started tracking? This anchors your
        opening balance so the numbers make sense from day one.
      </Body>

      <form onSubmit={handleSave}>
        <div className="field-wrap" style={{ marginBottom: 8 }}>
          <label className="field-label">Current account balance</label>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#5E6E85",
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              $
            </span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{ paddingLeft: 26 }}
              autoFocus
            />
          </div>
        </div>
        <ErrorMsg msg={error} />

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={onSkip}
            style={{ flex: 1 }}
          >
            Skip for now
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={!value.trim() || saving}
            style={{ flex: 2 }}
          >
            {saving ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </form>
    </>
  );
}

// ── Step 2: Monthly income ────────────────────────────────────────────────────

function Step2({ onNext, onSkip }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      setError("Please enter a positive monthly income.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Fetch any existing income budget categories first
      const res = await client.get("/budget/categories?kind=income").catch(() => ({ data: [] }));
      const existing = Array.isArray(res.data) ? res.data : [];

      if (existing.length > 0) {
        // Update the first income category's planned amount; leave others intact
        const updated = existing.map((c, i) =>
          i === 0 ? { ...c, planned: num } : c,
        );
        await client.put("/budget/categories", { categories: updated });
      } else {
        // No income categories yet — create a sensible default
        await client.put("/budget/categories", {
          categories: [
            { name: "Primary Income", kind: "income", planned: num, color: "#10B981" },
          ],
        });
      }
      onNext();
    } catch {
      // Non-fatal — advance anyway so the wizard doesn't feel broken
      onNext();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Title>💵 Monthly income</Title>
      <Body>
        What's your typical monthly take-home pay? This lets the dashboard show
        how much of your income target you've received so far each month.
      </Body>

      <form onSubmit={handleSave}>
        <div className="field-wrap" style={{ marginBottom: 8 }}>
          <label className="field-label">Monthly income (take-home)</label>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#5E6E85",
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              $
            </span>
            <input
              className="input"
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{ paddingLeft: 26 }}
              autoFocus
            />
          </div>
        </div>
        <ErrorMsg msg={error} />

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={onSkip}
            style={{ flex: 1 }}
          >
            Skip for now
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={!value.trim() || saving}
            style={{ flex: 2 }}
          >
            {saving ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </form>
    </>
  );
}

// ── Step 3: Done ──────────────────────────────────────────────────────────────

function Step3({ onComplete }) {
  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
        <Title>You're all set!</Title>
        <Body>
          Your dashboard is ready. You can always update your balance and income
          targets in{" "}
          <strong style={{ color: "#F1F5F9", fontWeight: 500 }}>Settings</strong>{" "}
          at any time.
        </Body>

        {/* Quick-tip chips */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            textAlign: "left",
            marginBottom: 22,
          }}
        >
          {[
            { icon: "📝", text: "Log transactions in the Transactions tab" },
            { icon: "📅", text: "Track bills & subscriptions under Bills & Subs" },
            { icon: "🏦", text: "Anchor to your real bank balance in Settings" },
          ].map(({ icon, text }) => (
            <div
              key={text}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                fontSize: 12,
                color: "#8896A5",
              }}
            >
              <span>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="btn-primary"
        style={{ width: "100%" }}
        onClick={onComplete}
      >
        Open Dashboard →
      </button>
    </>
  );
}

// ── OnboardingWizard — default export ─────────────────────────────────────────

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(1);

  const next = () => setStep((s) => s + 1);

  return (
    <ModalShell>
      <StepDots current={step} />
      {step === 1 && <Step1 onNext={next} onSkip={next} />}
      {step === 2 && <Step2 onNext={next} onSkip={next} />}
      {step === 3 && <Step3 onComplete={onComplete} />}
    </ModalShell>
  );
}
