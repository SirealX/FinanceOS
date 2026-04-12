import { useState, useEffect } from "react";

import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Budget from "./pages/Budget";
import Bills from "./pages/Bills";
import Debts from "./pages/Debts";
import Savings from "./pages/Savings";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";

import { NavProvider } from "./context/NavContext";
import { SettingsProvider } from "./context/SettingsContext";

import { DEMO_USER } from "./data/MockData";
import client from "./api/client";

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";

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
    showDraftBadge: true, // ← pulls live draft count
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
    badge: 3,
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

// ── App Shell ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeId, setActiveId] = useState("dashboard");
  const [draftCount, setDraftCount] = useState(0);

  // FIX #3: Poll draft count every 5 seconds (was 30s) for near-real-time
  // badge updates. Also refreshes immediately on every tab navigation so
  // confirming a payment method clears the badge without waiting for the next poll.
  async function fetchDraftCount() {
    if (IS_DEMO) return;
    try {
      const res = await client.get("/transactions/drafts/count");
      setDraftCount(res.data.count ?? 0);
    } catch {
      // silently ignore — badge just shows 0
    }
  }

  // Poll on an interval
  useEffect(() => {
    if (IS_DEMO) return;
    fetchDraftCount();
    const interval = setInterval(fetchDraftCount, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Refresh immediately on every tab change
  function handleNavigate(id) {
    setActiveId(id);
    fetchDraftCount();
  }

  const activeItem = NAV_ITEMS_CONFIG.find((item) => item.id === activeId);

  return (
    <NavProvider onNavigate={handleNavigate}>
      <SettingsProvider>
        <div className="app-shell">
          {/* ── Sidebar ── */}
          <aside className="app-sidebar">
            <div className="sidebar-logo">
              <span>Finance</span>OS
            </div>

            <div className="sidebar-section-label">Main Menu</div>

            <nav>
              {NAV_ITEMS_CONFIG.map((item) => {
                // Transactions nav item shows live draft count
                const badge = item.showDraftBadge
                  ? draftCount > 0
                    ? draftCount
                    : null
                  : item.badge != null
                    ? item.badge
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
                    {badge != null && (
                      <span className="nav-badge">{badge}</span>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="sidebar-user">
              <div
                className="avatar"
                style={{
                  width: 32,
                  height: 32,
                  background: "rgba(16,185,129,0.13)",
                  color: "var(--color-income)",
                  fontSize: 11,
                }}
              >
                {DEMO_USER.initials}
              </div>
              <div className="sidebar-user-info">
                <div className="name">{DEMO_USER.name}</div>
                <div className="role">{DEMO_USER.role}</div>
              </div>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="app-main">{activeItem?.component}</main>
        </div>
      </SettingsProvider>
    </NavProvider>
  );
}
