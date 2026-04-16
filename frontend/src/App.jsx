import { useState, useEffect, useRef, useCallback } from "react";

import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Budget from "./pages/Budget";
import Bills from "./pages/Bills";
import Debts from "./pages/Debts";
import Savings from "./pages/Savings";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Login from "./pages/Login";

import SetPassword from "./pages/SetPassword";

import { NavProvider } from "./context/NavContext";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { AuthProvider, useAuth } from "./context/Authcontexts";
import { fetchUnreadCount } from "./api/Alert";

import { DEMO_USER } from "./data/MockData";
import client from "./api/client";

// ── Nav item icon definitions ─────────────────────────────────────────────────

const NAV_ITEMS_CONFIG = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <rect x="1.5" y="1.5" width="5" height="5" rx="1.2" />
        <rect x="8.5" y="1.5" width="5" height="5" rx="1.2" />
        <rect x="1.5" y="8.5" width="5" height="5" rx="1.2" />
        <rect x="8.5" y="8.5" width="5" height="5" rx="1.2" />
      </svg>
    ),
    component: <Dashboard />,
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <circle cx="2.5" cy="4.5" r="1" fill="currentColor" stroke="none" />
        <line x1="5" y1="4.5" x2="13.5" y2="4.5" strokeLinecap="round" />
        <circle cx="2.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
        <line x1="5" y1="7.5" x2="13.5" y2="7.5" strokeLinecap="round" />
        <circle cx="2.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <line x1="5" y1="10.5" x2="13.5" y2="10.5" strokeLinecap="round" />
      </svg>
    ),
    component: <Transactions />,
    showDraftBadge: true,
  },
  {
    id: "budget",
    label: "Budget",
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <rect x="1.5" y="9" width="3" height="4.5" rx="0.8" />
        <rect x="6" y="5.5" width="3" height="8" rx="0.8" />
        <rect x="10.5" y="2" width="3" height="11.5" rx="0.8" />
      </svg>
    ),
    component: <Budget />,
  },
  {
    id: "bills",
    label: "Bills & Subs",
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <rect x="1.5" y="2.5" width="12" height="11" rx="1.5" />
        <line x1="1.5" y1="6" x2="13.5" y2="6" strokeLinecap="round" />
        <line x1="5" y1="1.5" x2="5" y2="4" strokeLinecap="round" />
        <line x1="10" y1="1.5" x2="10" y2="4" strokeLinecap="round" />
        <rect
          x="4"
          y="8.5"
          width="2"
          height="2"
          rx="0.4"
          fill="currentColor"
          stroke="none"
        />
        <rect
          x="6.5"
          y="8.5"
          width="2"
          height="2"
          rx="0.4"
          fill="currentColor"
          stroke="none"
        />
        <rect
          x="9"
          y="8.5"
          width="2"
          height="2"
          rx="0.4"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    ),
    component: <Bills />,
  },
  {
    id: "debts",
    label: "Debt Tracker",
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <rect x="1" y="3.5" width="13" height="8" rx="1.5" />
        <line x1="1" y1="6.5" x2="14" y2="6.5" />
        <rect
          x="3"
          y="9"
          width="3"
          height="1.2"
          rx="0.5"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    ),
    component: <Debts />,
  },
  {
    id: "savings",
    label: "Savings Goals",
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <circle cx="7.5" cy="7.5" r="6" />
        <circle cx="7.5" cy="7.5" r="3.5" />
        <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    component: <Savings />,
  },
  {
    id: "alerts",
    label: "Alerts",
    showAlertBadge: true,
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <path d="M7.5 1.5a4.5 4.5 0 0 1 4.5 4.5c0 2.5.8 3.8 1.5 4.5H1.5C2.2 9.8 3 8.5 3 6a4.5 4.5 0 0 1 4.5-4.5z" />
        <path d="M6 11.5a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
      </svg>
    ),
    component: <Alerts />,
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="nav-icon" viewBox="0 0 15 15">
        <circle cx="7.5" cy="7.5" r="2" />
        <path
          d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.9 2.9l1.1 1.1M11 11l1.1 1.1M2.9 12.1l1.1-1.1M11 4l1.1-1.1"
          strokeLinecap="round"
        />
      </svg>
    ),
    component: <Settings />,
  },
];

// ── WelcomeModal — shown on first login when no display name is set yet ────────

function WelcomeModal() {
  const { updatePreferences, loading: prefsLoading } = useSettings();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updatePreferences({ displayName: trimmed });
    } finally {
      setSaving(false);
    }
  }

  if (prefsLoading) return null; // wait until we know whether a name exists

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#141826",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: "36px 32px 28px",
          width: "100%",
          maxWidth: 400,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#F1F5F9",
            marginBottom: 8,
            letterSpacing: "-0.3px",
          }}
        >
          Welcome to <span style={{ color: "#10B981" }}>Finance</span>OS 👋
        </div>
        <p
          style={{
            fontSize: 13,
            color: "#5E6E85",
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          Before you dive in, what should we call you? This name will appear on
          your dashboard.
        </p>
        <form onSubmit={handleSave}>
          <div className="field-wrap" style={{ marginBottom: 20 }}>
            <label className="field-label">Your first name</label>
            <input
              className="input"
              placeholder="e.g. César"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={50}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={!name.trim() || saving}
              style={{ flex: 1 }}
            >
              {saving ? "Saving…" : "Let's go →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── App Shell (rendered only when authenticated or in demo mode) ───────────────

function AppShell() {
  const { user, isDemo, signOut } = useAuth();
  const { displayName, loading: prefsLoading } = useSettings();
  const [activeId, setActiveId] = useState("dashboard");
  const [draftCount, setDraftCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const consecutiveFailures = useRef(0);
  const pollIntervalRef = useRef(null);

  // Derive a clean first name for the sidebar:
  // 1. Use displayName if set
  // 2. Fall back to the part before the @ in the email
  // 3. Final fallback: "User"
  const resolvedName =
    displayName ?? (user?.email ? user.email.split("@")[0] : null) ?? "User";

  const sidebarUser = isDemo
    ? { initials: "DU", name: DEMO_USER.name, role: "Demo Mode" }
    : {
        initials: resolvedName[0].toUpperCase(),
        name: resolvedName,
        role: "Personal",
      };

  // Show the welcome modal when the user is logged in (not demo) and has no name yet
  const showWelcome = !isDemo && !prefsLoading && displayName === null;

  async function fetchDraftCount() {
    if (isDemo) return;
    try {
      const res = await client.get("/transactions/drafts/count");
      setDraftCount(res.data.count ?? 0);
      consecutiveFailures.current = 0; // reset on success
    } catch {
      consecutiveFailures.current += 1;
      // Stop polling after 3 consecutive failures to avoid flooding the console
      // when the backend is unreachable. It resumes on the next page/tab navigation.
      if (consecutiveFailures.current >= 3 && pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }

  async function fetchAlertCount() {
    try {
      const count = await fetchUnreadCount();
      setAlertCount(count);
    } catch {
      // Non-critical — badge just stays at previous value
    }
  }

  useEffect(() => {
    if (isDemo) {
      // In demo mode seed the alert badge from the mock data count
      fetchAlertCount();
      return;
    }
    consecutiveFailures.current = 0;
    fetchDraftCount();
    fetchAlertCount();
    pollIntervalRef.current = setInterval(() => {
      fetchDraftCount();
      fetchAlertCount();
    }, 30_000); // alerts poll at 30s (less aggressive than drafts)
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isDemo]);

  function handleNavigate(id) {
    setActiveId(id);
    // Resume polling if it was suspended due to failures
    if (!pollIntervalRef.current && !isDemo) {
      consecutiveFailures.current = 0;
      fetchDraftCount();
      fetchAlertCount();
      pollIntervalRef.current = setInterval(() => {
        fetchDraftCount();
        fetchAlertCount();
      }, 30_000);
    } else {
      fetchDraftCount();
      // Refresh alert badge immediately when navigating away from the Alerts page
      if (id !== "alerts") fetchAlertCount();
    }
  }

  const activeItem = NAV_ITEMS_CONFIG.find((item) => item.id === activeId);

  return (
    <NavProvider onNavigate={handleNavigate}>
      {showWelcome && <WelcomeModal />}
      <div className="app-shell">
        {/* ── Sidebar ── */}
        <aside className="app-sidebar">
          <div className="sidebar-logo">
            <span>Finance</span>OS
            {isDemo && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 500,
                  background: "rgba(167,139,250,0.15)",
                  color: "#A78BFA",
                  padding: "1px 7px",
                  borderRadius: 10,
                  letterSpacing: "0.3px",
                }}
              >
                DEMO
              </span>
            )}
          </div>

          <div className="sidebar-section-label">Main Menu</div>

          <nav>
            {NAV_ITEMS_CONFIG.map((item) => {
              const badge = item.showDraftBadge
                ? draftCount > 0
                  ? draftCount
                  : null
                : item.showAlertBadge
                  ? alertCount > 0
                    ? alertCount
                    : null
                  : null;

              return (
                <div
                  key={item.id}
                  className={`nav-item${activeId === item.id ? " active" : ""}`}
                  onClick={() => handleNavigate(item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleNavigate(item.id)
                  }
                  aria-current={activeId === item.id ? "page" : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {badge != null && <span className="nav-badge">{badge}</span>}
                </div>
              );
            })}
          </nav>

          {/* User row + sign out */}
          <div className="sidebar-user">
            <div
              className="avatar"
              style={{
                width: 32,
                height: 32,
                background: isDemo
                  ? "rgba(167,139,250,0.13)"
                  : "rgba(16,185,129,0.13)",
                color: isDemo ? "var(--color-savings)" : "var(--color-income)",
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {sidebarUser.initials}
            </div>
            <div className="sidebar-user-info" style={{ flex: 1, minWidth: 0 }}>
              <div
                className="name"
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {sidebarUser.name}
              </div>
              <div className="role">{sidebarUser.role}</div>
            </div>
            {/* Sign out / Exit demo */}
            <button
              title={isDemo ? "Exit demo" : "Sign out"}
              onClick={signOut}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#CBD5E1")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--color-text-muted)")
              }
            >
              <svg
                viewBox="0 0 15 15"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5.5 7.5H13M10 4.5l3 3-3 3" />
                <path d="M8 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h5" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="app-main">{activeItem?.component}</main>

        {/* ── Mobile bottom navigation (phones ≤600px only) ── */}
        <nav className="mobile-bottom-nav" aria-label="Main navigation">
          {NAV_ITEMS_CONFIG.map((item) => {
            const badge = item.showDraftBadge
              ? draftCount > 0
                ? draftCount
                : null
              : item.showAlertBadge
                ? alertCount > 0
                  ? alertCount
                  : null
                : null;

            return (
              <div
                key={item.id}
                className={`mobile-nav-item${activeId === item.id ? " active" : ""}`}
                onClick={() => handleNavigate(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleNavigate(item.id)
                }
                aria-current={activeId === item.id ? "page" : undefined}
              >
                {item.icon}
                <span>{item.label}</span>
                {badge != null && (
                  <span className="mobile-nav-badge">{badge}</span>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </NavProvider>
  );
}

// ── Root — handles auth state before rendering anything ───────────────────────

function Root() {
  const { user, isDemo, loading, needsPasswordSetup } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0D16",
        }}
      >
        {/* Minimal pulse — no spinner, just the logo */}
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#F1F5F9",
            opacity: 0.5,
            letterSpacing: "-0.3px",
            animation: "skeleton-pulse 1.6s ease-in-out infinite",
          }}
        >
          <span style={{ color: "#10B981" }}>Finance</span>OS
        </div>
      </div>
    );
  }

  // Not authenticated and not in demo mode → show login page
  if (!user && !isDemo) {
    return <Login />;
  }

  // Authenticated via invitation or password-recovery link → set password first
  if (user && needsPasswordSetup) {
    return <SetPassword />;
  }

  // Authenticated or demo mode → show the full app
  return <AppShell />;
}

// ── Default export — wraps everything with AuthProvider ───────────────────────

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </AuthProvider>
  );
}
