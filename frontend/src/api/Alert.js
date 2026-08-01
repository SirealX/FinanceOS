/**
 * api/Alerts.js — Alert business logic + useAlerts() hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero JSX. Zero raw data.
 * All HTTP calls go through the axios wrappers in alerts.js (lowercase).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAlerts,
  markRead,
  markAllRead,
  deleteAlert,
  getAlertPreferences,
  updateAlertPreferences,
  getUnreadCount,
  connectTelegram,
  disconnectTelegram,
  subscribePush,
  unsubscribePush,
} from "./alert.axios";
import { DEMO_ALERT_FEED, DEMO_ALERT_PREFERENCES } from "../data/MockData";
import { useAuth } from "../context/Authcontexts";

// ── Relative timestamp formatter ──────────────────────────────────────────────

export function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Severity → visual config ──────────────────────────────────────────────────

export function getSeverityConfig(severity) {
  switch (severity) {
    case "critical":
      return {
        color: "var(--color-expense)",
        bg: "rgba(249,115,22,0.10)",
        dot: "#EF4444",
        icon: "🔴",
      };
    case "warning":
      return {
        color: "#F59E0B",
        bg: "rgba(245,158,11,0.10)",
        dot: "#F59E0B",
        icon: "⚠️",
      };
    default: // info
      return {
        color: "var(--color-text-secondary)",
        bg: "rgba(255,255,255,0.04)",
        dot: "#38BDF8",
        icon: "ℹ️",
      };
  }
}

// ── Alert type → icon ─────────────────────────────────────────────────────────

export function getAlertIcon(type) {
  const icons = {
    bill_due: "📅",
    large_transaction: "💸",
    low_balance: "📉",
    debt_overdue: "💳",
    goal_reached: "✅",
    budget_exceeded: "📊",
    spending_spike: "📈",
    import_reminder: "📋",
    near_limit: "⚠️",
  };
  return icons[type] || "🔔";
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAlerts() {
  const { isDemo: IS_DEMO } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unread, setUnread] = useState(0);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      if (IS_DEMO) {
        setAlerts(DEMO_ALERT_FEED);
        setPrefs(DEMO_ALERT_PREFERENCES);
        setUnread(
          DEMO_ALERT_FEED.filter((a) => !a.read_at && a.tier <= 2).length,
        );
        setLoading(false);
        return;
      }
      const [alertsData, prefsData, countData] = await Promise.all([
        getAlerts(),
        getAlertPreferences(),
        getUnreadCount(),
      ]);
      setAlerts(alertsData);
      setPrefs(prefsData);
      setUnread(countData.count ?? 0);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [IS_DEMO]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function dismiss(id) {
    if (IS_DEMO) {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, read_at: new Date().toISOString() } : a,
        ),
      );
      setUnread((prev) => Math.max(0, prev - 1));
      return;
    }
    const updated = await markRead(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    setUnread((prev) => Math.max(0, prev - 1));
  }

  async function dismissAll() {
    if (IS_DEMO) {
      const now = new Date().toISOString();
      setAlerts((prev) =>
        prev.map((a) => ({ ...a, read_at: a.read_at || now })),
      );
      setUnread(0);
      return;
    }
    await markAllRead();
    const now = new Date().toISOString();
    setAlerts((prev) => prev.map((a) => ({ ...a, read_at: a.read_at || now })));
    setUnread(0);
  }

  async function remove(id) {
    if (IS_DEMO) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      return;
    }
    // BUG-13 fix: capture wasUnread from the current alerts snapshot BEFORE
    // any state updates — referencing `alerts` inside setUnread's updater
    // captured a stale closure from the outer scope.
    const wasUnread = alerts.find(
      (a) => a.id === id && !a.read_at && a.tier <= 2,
    );
    await deleteAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setUnread((prev) => (wasUnread ? Math.max(0, prev - 1) : prev));
  }

  async function savePrefs(updates) {
    if (IS_DEMO) {
      setPrefs((prev) => ({ ...prev, ...updates }));
      return { ...prefs, ...updates };
    }
    const updated = await updateAlertPreferences(updates);
    setPrefs(updated);
    return updated;
  }

  async function linkTelegram(chatId) {
    const updated = await connectTelegram(chatId);
    setPrefs(updated);
    return updated;
  }

  async function unlinkTelegram() {
    const updated = await disconnectTelegram();
    setPrefs(updated);
    return updated;
  }

  async function enablePush(subscriptionObj) {
    const updated = await subscribePush(subscriptionObj);
    setPrefs(updated);
    return updated;
  }

  async function disablePush() {
    const updated = await unsubscribePush();
    setPrefs(updated);
    return updated;
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const unreadAlerts = alerts.filter((a) => !a.read_at);
  const readAlerts = alerts.filter((a) => a.read_at);

  return {
    alerts,
    unreadAlerts,
    readAlerts,
    prefs,
    loading,
    error,
    unread,
    reload: load,
    dismiss,
    dismissAll,
    remove,
    savePrefs,
    linkTelegram,
    unlinkTelegram,
    enablePush,
    disablePush,
  };
}

// ── Standalone unread count fetch (used by App.jsx sidebar badge) ─────────────
// Accepts isDemo at the call site because this is not a hook and cannot call useAuth().

export async function fetchUnreadCount(isDemo = false) {
  if (isDemo) {
    return DEMO_ALERT_FEED.filter((a) => !a.read_at && a.tier <= 2).length;
  }
  const data = await getUnreadCount();
  return data.count ?? 0;
}
