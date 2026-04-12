import { useState } from "react";

// ─── Demo data ────────────────────────────────────────────────────────────────
import { INITIAL_ALERT_CHANNELS, INITIAL_ALERT_RULES } from "../data/MockData";

// ─────────────────────────────────────────────────────────────────────────────
// Toggle switch
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle, locked = false }) {
  return (
    <div
      onClick={locked ? undefined : onToggle}
      title={locked ? "This channel cannot be disabled" : undefined}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        flexShrink: 0,
        background: on ? "var(--color-income)" : "rgba(255,255,255,0.1)",
        position: "relative",
        cursor: locked ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        opacity: locked ? 0.6 : 1,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Card
// ─────────────────────────────────────────────────────────────────────────────

function ChannelCard({ channel, onChange }) {
  function toggle() {
    if (channel.locked) return;
    onChange({ ...channel, enabled: !channel.enabled });
  }

  function updateValue(val) {
    onChange({ ...channel, value: val });
  }

  return (
    <div
      style={{
        background: "var(--color-bg-input)",
        border: channel.enabled
          ? "0.5px solid rgba(16,185,129,0.3)"
          : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "14px 16px",
        transition: "border-color 0.2s",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: channel.enabled && channel.field ? 12 : 0,
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>{channel.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              {channel.label}
            </span>
            {channel.locked && (
              <span className="badge badge-income" style={{ fontSize: 10 }}>
                Always on
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            {channel.description}
          </div>
        </div>
        <Toggle
          on={channel.enabled}
          onToggle={toggle}
          locked={channel.locked}
        />
      </div>

      {/* Contact input — visible when enabled and channel requires a contact value */}
      {channel.enabled && channel.field && (
        <div className="field-wrap">
          <label className="field-label">
            {channel.field === "phone" ? "Phone Number" : "Email Address"}
          </label>
          <input
            className="input"
            type={channel.field === "email" ? "email" : "tel"}
            placeholder={channel.placeholder}
            value={channel.value}
            onChange={(e) => updateValue(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Row
// ─────────────────────────────────────────────────────────────────────────────

function RuleRow({ rule, channels, onChange }) {
  function toggle() {
    onChange({ ...rule, enabled: !rule.enabled });
  }

  function updateThreshold(val) {
    const n = parseInt(val, 10);
    if (!isNaN(n))
      onChange({
        ...rule,
        threshold: Math.min(rule.max, Math.max(rule.min, n)),
      });
  }

  function toggleChannel(channelId) {
    const already = rule.channels.includes(channelId);
    const updated = already
      ? rule.channels.filter((c) => c !== channelId)
      : [...rule.channels, channelId];
    onChange({ ...rule, channels: updated });
  }

  // Only show non-inapp channels that are enabled in the delivery settings
  const availableChannels = channels.filter(
    (c) => c.id !== "inapp" && c.enabled,
  );

  return (
    <div
      style={{
        padding: "16px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Rule icon */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            background: rule.enabled ? rule.colorBg : "rgba(255,255,255,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            transition: "background 0.2s",
          }}
        >
          {rule.icon}
        </div>

        {/* Label + description + controls */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: rule.enabled
                ? "var(--color-text-primary)"
                : "var(--color-text-hint)",
              transition: "color 0.2s",
            }}
          >
            {rule.label}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            {rule.description}
          </div>

          {/* Threshold + channel chips — only when rule is enabled */}
          {rule.enabled && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              {/* Threshold input */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rule.thresholdLabel}
                </span>
                <input
                  type="number"
                  min={rule.min}
                  max={rule.max}
                  step={rule.step}
                  value={rule.threshold}
                  onChange={(e) => updateThreshold(e.target.value)}
                  style={{
                    width: 56,
                    background: "var(--color-bg-input)",
                    border: "0.5px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 12,
                    color: "var(--color-text-primary)",
                    textAlign: "center",
                    outline: "none",
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rule.thresholdUnit}
                </span>
              </div>

              {/* Channel chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {/* In-app is always included and non-removable */}
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                  🔔 In-App
                </span>
                {availableChannels.map((ch) => {
                  const active = rule.channels.includes(ch.id);
                  return (
                    <button
                      key={ch.id}
                      onClick={() => toggleChannel(ch.id)}
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: 10,
                        border: "none",
                        cursor: "pointer",
                        background: active
                          ? rule.colorBg
                          : "rgba(255,255,255,0.06)",
                        color: active ? rule.color : "var(--color-text-muted)",
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      {ch.icon} {ch.label}
                    </button>
                  );
                })}
                {availableChannels.length === 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    Enable a channel above to add more delivery options
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Toggle */}
        <Toggle on={rule.enabled} onToggle={toggle} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerts View
// ─────────────────────────────────────────────────────────────────────────────

export default function Alerts() {
  const [channels, setChannels] = useState(INITIAL_ALERT_CHANNELS);
  const [rules, setRules] = useState(INITIAL_ALERT_RULES);
  const [saved, setSaved] = useState(false);

  const activeRules = rules.filter((r) => r.enabled).length;
  const activeChannels = channels.filter((c) => c.enabled).length;

  function updateChannel(updated) {
    setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function updateRule(updated) {
    setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      {/* ── Zone 1: Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Alerts & Notifications</h1>
          <p className="page-subtitle">
            Configure which events trigger alerts and how you receive them
          </p>
        </div>
        <button className="btn-primary" onClick={handleSave}>
          {saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>

      {/* ── Status summary strip ── */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 14,
          padding: "10px 16px",
          background: "var(--color-bg-card)",
          borderRadius: 10,
          border: "var(--border-default)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background:
                activeRules > 0
                  ? "var(--color-income)"
                  : "var(--color-text-muted)",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            <strong style={{ color: "var(--color-text-primary)" }}>
              {activeRules}
            </strong>{" "}
            rule{activeRules !== 1 ? "s" : ""} active
          </span>
        </div>

        <div
          style={{
            width: "0.5px",
            background: "rgba(255,255,255,0.08)",
            alignSelf: "stretch",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background:
                activeChannels > 1
                  ? "var(--color-income)"
                  : "var(--color-text-muted)",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            <strong style={{ color: "var(--color-text-primary)" }}>
              {activeChannels}
            </strong>{" "}
            delivery channel{activeChannels !== 1 ? "s" : ""} enabled
          </span>
        </div>

        {activeChannels === 1 && (
          <>
            <div
              style={{
                width: "0.5px",
                background: "rgba(255,255,255,0.08)",
                alignSelf: "stretch",
              }}
            />
            <span style={{ fontSize: 11, color: "var(--color-expense)" }}>
              ⚠️ Only in-app alerts active — enable a channel below to receive
              external notifications
            </span>
          </>
        )}
      </div>

      {/* ── Delivery Channels ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-header">Delivery Channels</h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginTop: -12,
            marginBottom: 16,
          }}
        >
          Choose where you want to receive alert notifications. External
          channels require a valid contact.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {channels.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} onChange={updateChannel} />
          ))}
        </div>
      </div>

      {/* ── Alert Rules ── */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <h2 className="section-header" style={{ margin: 0 }}>
            Alert Rules
          </h2>
          <span className="count-badge">{activeRules} active</span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginBottom: 4,
          }}
        >
          Enable rules and adjust thresholds. Each rule evaluates after every
          sync and on a daily schedule.
        </p>

        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            channels={channels}
            onChange={updateRule}
          />
        ))}
      </div>
    </>
  );
}
