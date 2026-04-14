import { useState } from "react";
import {
  useAlerts,
  formatRelativeTime,
  getSeverityConfig,
  getAlertIcon,
} from "../api/Alert";

// ─────────────────────────────────────────────────────────────────────────────
// Toggle switch (shared)
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle, locked = false, disabled = false }) {
  return (
    <div
      onClick={locked || disabled ? undefined : onToggle}
      title={locked ? "This channel cannot be disabled" : undefined}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        flexShrink: 0,
        background: on ? "var(--color-income)" : "rgba(255,255,255,0.1)",
        position: "relative",
        cursor: locked || disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        opacity: locked || disabled ? 0.5 : 1,
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
// Section 1 — Alert Feed
// ─────────────────────────────────────────────────────────────────────────────

function AlertItem({ alert, onDismiss, onDelete }) {
  const sev = getSeverityConfig(alert.severity);
  const icon = getAlertIcon(alert.type);
  const isRead = Boolean(alert.read_at);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
        opacity: isRead ? 0.55 : 1,
        transition: "opacity 0.2s",
      }}
    >
      {/* Unread dot */}
      <div style={{ paddingTop: 5, flexShrink: 0 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: isRead ? "transparent" : sev.dot,
            border: isRead ? "1px solid rgba(255,255,255,0.12)" : "none",
          }}
        />
      </div>

      {/* Icon */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          flexShrink: 0,
          background: sev.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: isRead ? 400 : 500,
            color: isRead
              ? "var(--color-text-secondary)"
              : "var(--color-text-primary)",
            marginBottom: 3,
          }}
        >
          {alert.title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            lineHeight: 1.5,
          }}
        >
          {alert.body}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-hint)",
            marginTop: 5,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{formatRelativeTime(alert.created_at)}</span>
          {alert.tier === 1 && !isRead && (
            <span
              style={{
                background: sev.bg,
                color: sev.dot,
                padding: "1px 7px",
                borderRadius: 8,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.3px",
                textTransform: "uppercase",
              }}
            >
              Immediate
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          flexShrink: 0,
        }}
      >
        {!isRead && (
          <button
            onClick={() => onDismiss(alert.id)}
            title="Mark as read"
            style={{
              background: "none",
              border: "0.5px solid rgba(255,255,255,0.12)",
              borderRadius: 6,
              color: "var(--color-text-muted)",
              fontSize: 10,
              padding: "3px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Dismiss
          </button>
        )}
        <button
          onClick={() => onDelete(alert.id)}
          title="Delete alert"
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-hint)",
            cursor: "pointer",
            fontSize: 11,
            padding: "3px 6px",
            borderRadius: 4,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function AlertFeed({ alerts, unreadCount, onDismiss, onDelete, onDismissAll }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? alerts : alerts.slice(0, 10);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 className="section-header" style={{ margin: 0 }}>
            Alert Feed
          </h2>
          {unreadCount > 0 && (
            <span className="count-badge">{unreadCount} unread</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={onDismissAll}
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              background: "none",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Items */}
      {alerts.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 0",
            color: "var(--color-text-muted)",
            fontSize: 13,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
          No active alerts — you're all caught up
        </div>
      ) : (
        <>
          {displayed.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onDismiss={onDismiss}
              onDelete={onDelete}
            />
          ))}
          {alerts.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "var(--color-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              {showAll ? "Show less" : `Show ${alerts.length - 10} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Notification Settings
// ─────────────────────────────────────────────────────────────────────────────

// ── Telegram consent modal ────────────────────────────────────────────────────

function TelegramConsentModal({ onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--color-bg-card)",
          border: "var(--border-default)",
          borderRadius: 14,
          padding: "28px 24px",
          maxWidth: 400,
          width: "100%",
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 14 }}>
          ✈️ Before you connect Telegram
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          Notifications sent via Telegram may include financial details such as
          transaction amounts, account balances, and bill names. These messages
          are stored on Telegram's servers and are{" "}
          <strong style={{ color: "var(--color-text-primary)" }}>
            not end-to-end encrypted
          </strong>
          .
          <br />
          <br />
          If you prefer private notifications, use{" "}
          <strong style={{ color: "var(--color-text-primary)" }}>
            PWA Push
          </strong>{" "}
          instead — your data stays on your device only.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "10px 0",
              background: "rgba(255,255,255,0.06)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "var(--color-text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2,
              padding: "10px 0",
              background: "var(--color-income)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            I understand, connect Telegram
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Telegram chat_id setup prompt ─────────────────────────────────────────────

function TelegramSetupModal({ onConnect, onCancel }) {
  const [chatId, setChatId] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--color-bg-card)",
          border: "var(--border-default)",
          borderRadius: 14,
          padding: "28px 24px",
          maxWidth: 400,
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 20,
            marginBottom: 8,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          Connect Telegram
        </div>
        <ol
          style={{
            fontSize: 12,
            color: "var(--color-text-secondary)",
            lineHeight: 2,
            paddingLeft: 18,
            marginBottom: 20,
          }}
        >
          <li>Open Telegram and search for your FinanceOS bot</li>
          <li>
            Send the command{" "}
            <code style={{ color: "var(--color-income)" }}>/start</code>
          </li>
          <li>The bot replies with your Chat ID — paste it below</li>
        </ol>
        <div className="field-wrap" style={{ marginBottom: 16 }}>
          <label className="field-label">Your Telegram Chat ID</label>
          <input
            className="input"
            type="text"
            placeholder="e.g. 123456789"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "10px 0",
              background: "rgba(255,255,255,0.06)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "var(--color-text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => chatId.trim() && onConnect(chatId.trim())}
            disabled={!chatId.trim()}
            style={{
              flex: 2,
              padding: "10px 0",
              background: chatId.trim()
                ? "var(--color-income)"
                : "rgba(255,255,255,0.08)",
              border: "none",
              borderRadius: 8,
              color: chatId.trim() ? "#fff" : "var(--color-text-hint)",
              fontSize: 13,
              fontWeight: 600,
              cursor: chatId.trim() ? "pointer" : "not-allowed",
            }}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Channel cards ─────────────────────────────────────────────────────────────

function InAppCard() {
  return (
    <div
      style={{
        background: "var(--color-bg-input)",
        border: "0.5px solid rgba(16,185,129,0.2)",
        borderRadius: 10,
        padding: "14px 16px",
        gridColumn: "1 / -1",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>🔔</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              In-App
            </span>
            <span className="badge badge-income" style={{ fontSize: 10 }}>
              Always on
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            Alerts appear in the dashboard notification feed
          </div>
        </div>
        <Toggle on={true} locked={true} />
      </div>
    </div>
  );
}

function TelegramCard({ prefs, onSavePrefs, onLink, onUnlink }) {
  const [showConsent, setShowConsent] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving] = useState(false);

  const connected = Boolean(prefs?.telegram_chat_id);

  async function handleToggle() {
    if (connected) {
      // Disconnect flow
      setSaving(true);
      await onUnlink();
      setSaving(false);
      return;
    }
    // Connect flow — check consent first
    if (!prefs?.telegram_consented) {
      setShowConsent(true);
    } else {
      setShowSetup(true);
    }
  }

  async function handleConsent() {
    setShowConsent(false);
    await onSavePrefs({ telegram_consented: true });
    setShowSetup(true);
  }

  async function handleConnect(chatId) {
    setShowSetup(false);
    setSaving(true);
    await onLink(chatId);
    setSaving(false);
  }

  async function toggleActiveMode() {
    setSaving(true);
    await onSavePrefs({ telegram_active_mode: !prefs?.telegram_active_mode });
    setSaving(false);
  }

  return (
    <>
      {showConsent && (
        <TelegramConsentModal
          onConfirm={handleConsent}
          onCancel={() => setShowConsent(false)}
        />
      )}
      {showSetup && (
        <TelegramSetupModal
          onConnect={handleConnect}
          onCancel={() => setShowSetup(false)}
        />
      )}

      <div
        style={{
          background: "var(--color-bg-input)",
          border: connected
            ? "0.5px solid rgba(16,185,129,0.3)"
            : "0.5px solid rgba(255,255,255,0.07)",
          borderRadius: 10,
          padding: "14px 16px",
          transition: "border-color 0.2s",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 20, marginTop: 1 }}>✈️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                }}
              >
                Telegram
              </span>
              {connected && (
                <span className="badge badge-income" style={{ fontSize: 10 }}>
                  Connected
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginBottom: 4,
              }}
            >
              Free · instant · interactive
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#F59E0B",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ⚠️ Messages stored on Telegram's servers
            </div>
          </div>
          <Toggle on={connected} onToggle={handleToggle} disabled={saving} />
        </div>

        {/* Active mode toggle — only when connected */}
        {connected && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "0.5px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
              >
                Active mode
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--color-text-muted)",
                  marginTop: 1,
                }}
              >
                Categorize transactions directly from Telegram
              </div>
            </div>
            <Toggle
              on={prefs?.telegram_active_mode ?? false}
              onToggle={toggleActiveMode}
              disabled={saving}
            />
          </div>
        )}
      </div>
    </>
  );
}

function PwaCard({ prefs, onSavePrefs, onEnable, onDisable }) {
  const [saving, setSaving] = useState(false);
  const enabled = Boolean(prefs?.pwa_push_enabled);

  async function handleToggle() {
    if (enabled) {
      setSaving(true);
      await onDisable();
      setSaving(false);
      return;
    }
    // Request browser permission, then subscribe
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      alert("Push notifications are not supported in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    try {
      setSaving(true);
      const reg = await navigator.serviceWorker.register("/sw.js");
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(vapidKey),
      });
      await onEnable(sub.toJSON());
    } catch (err) {
      console.error("[PwaCard] Subscribe failed:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--color-bg-input)",
        border: enabled
          ? "0.5px solid rgba(16,185,129,0.3)"
          : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "14px 16px",
        transition: "border-color 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 20, marginTop: 1 }}>📲</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 2,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              PWA Push
            </span>
            {enabled && (
              <span className="badge badge-income" style={{ fontSize: 10 }}>
                Enabled
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginBottom: 4,
            }}
          >
            Private · on-device · encrypted
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-hint)" }}>
            Requires adding the app to your phone home screen (one-time)
          </div>
        </div>
        <Toggle on={enabled} onToggle={handleToggle} disabled={saving} />
      </div>
    </div>
  );
}

// ── Threshold inputs ──────────────────────────────────────────────────────────

function ThresholdRow({
  label,
  hint,
  value,
  onChange,
  unit = "",
  type = "number",
  min,
  step = 1,
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type={type}
          min={min}
          step={step}
          value={value ?? ""}
          placeholder="—"
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : Number(v));
          }}
          style={{
            width: 72,
            background: "var(--color-bg-input)",
            border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
            color: "var(--color-text-primary)",
            textAlign: "center",
            outline: "none",
          }}
        />
        {unit && (
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function DigestTimeRow({ value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
          Daily digest time
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          When the daily summary is sent
        </div>
      </div>
      <input
        type="time"
        value={value ? value.slice(0, 5) : "09:00"}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "var(--color-bg-input)",
          border: "0.5px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 12,
          color: "var(--color-text-primary)",
          outline: "none",
          colorScheme: "dark",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Alerts view
// ─────────────────────────────────────────────────────────────────────────────

export default function Alerts() {
  const {
    alerts,
    unread,
    prefs,
    loading,
    error,
    dismiss,
    dismissAll,
    remove,
    savePrefs,
    linkTelegram,
    unlinkTelegram,
    enablePush,
    disablePush,
  } = useAlerts();

  // Local draft for threshold edits (saved on blur / debounce)
  const [localPrefs, setLocalPrefs] = useState(null);
  const [saved, setSaved] = useState(false);

  // Sync local draft when prefs load
  if (prefs && !localPrefs) {
    setLocalPrefs({ ...prefs });
  }

  async function handleSaveThresholds() {
    if (!localPrefs) return;
    await savePrefs({
      bill_due_days: localPrefs.bill_due_days,
      large_tx_threshold: localPrefs.large_tx_threshold,
      low_balance_floor: localPrefs.low_balance_floor,
      digest_enabled: localPrefs.digest_enabled,
      digest_time: localPrefs.digest_time?.slice(0, 5),
      immediate_enabled: localPrefs.immediate_enabled,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: 13,
        }}
      >
        Loading alerts…
      </div>
    );
  }

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Alerts & Notifications</h1>
          <p className="page-subtitle">
            Live alert feed and delivery channel configuration
          </p>
        </div>
        <button className="btn-primary" onClick={handleSaveThresholds}>
          {saved ? "✓ Saved" : "Save Settings"}
        </button>
      </div>

      {/* ── Section 1: Alert Feed ── */}
      <AlertFeed
        alerts={alerts}
        unreadCount={unread}
        onDismiss={dismiss}
        onDelete={remove}
        onDismissAll={dismissAll}
      />

      {/* ── Section 2: Notification Settings ── */}
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
          Choose where you receive external notifications. In-App alerts are
          always on.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <InAppCard />
          <TelegramCard
            prefs={prefs}
            onSavePrefs={savePrefs}
            onLink={linkTelegram}
            onUnlink={unlinkTelegram}
          />
          <PwaCard
            prefs={prefs}
            onSavePrefs={savePrefs}
            onEnable={enablePush}
            onDisable={disablePush}
          />
        </div>
      </div>

      {/* ── Section 2b: Thresholds + Digest ── */}
      <div className="card" style={{ marginBottom: 0 }}>
        <h2 className="section-header">Alert Thresholds</h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            marginTop: -12,
            marginBottom: 4,
          }}
        >
          Set numeric thresholds for each condition. Leave a field empty to
          disable that check.
        </p>

        {localPrefs && (
          <>
            <ThresholdRow
              label="Bill due reminder"
              hint="Fire alert this many days before the due date"
              value={localPrefs.bill_due_days}
              onChange={(v) =>
                setLocalPrefs((p) => ({ ...p, bill_due_days: v }))
              }
              unit="days before"
              min={1}
            />
            <ThresholdRow
              label="Large transaction alert"
              hint="Fire immediately for API-synced transactions above this amount"
              value={localPrefs.large_tx_threshold}
              onChange={(v) =>
                setLocalPrefs((p) => ({ ...p, large_tx_threshold: v }))
              }
              unit="$"
              min={0}
            />
            <ThresholdRow
              label="Low balance floor"
              hint="Fire when estimated spendable balance drops below this amount"
              value={localPrefs.low_balance_floor}
              onChange={(v) =>
                setLocalPrefs((p) => ({ ...p, low_balance_floor: v }))
              }
              unit="$"
              min={0}
            />
            <DigestTimeRow
              value={localPrefs.digest_time}
              onChange={(v) => setLocalPrefs((p) => ({ ...p, digest_time: v }))}
            />

            {/* Digest + Immediate toggles */}
            <div
              style={{
                display: "flex",
                gap: 20,
                paddingTop: 14,
                paddingBottom: 4,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Toggle
                  on={localPrefs.digest_enabled ?? true}
                  onToggle={() =>
                    setLocalPrefs((p) => ({
                      ...p,
                      digest_enabled: !p.digest_enabled,
                    }))
                  }
                />
                <div>
                  <div
                    style={{ fontSize: 12, color: "var(--color-text-primary)" }}
                  >
                    Daily digest
                  </div>
                  <div
                    style={{ fontSize: 10, color: "var(--color-text-muted)" }}
                  >
                    Batch Tier 2 alerts into one daily message
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Toggle
                  on={localPrefs.immediate_enabled ?? true}
                  onToggle={() =>
                    setLocalPrefs((p) => ({
                      ...p,
                      immediate_enabled: !p.immediate_enabled,
                    }))
                  }
                />
                <div>
                  <div
                    style={{ fontSize: 12, color: "var(--color-text-primary)" }}
                  >
                    Immediate Tier 1 push
                  </div>
                  <div
                    style={{ fontSize: 10, color: "var(--color-text-muted)" }}
                  >
                    Send critical alerts instantly
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PWA helper — convert VAPID public key from base64url to Uint8Array
// ─────────────────────────────────────────────────────────────────────────────

function _urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
