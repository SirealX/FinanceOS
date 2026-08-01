/**
 * NavContext.js — App-wide Navigation
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a single `navigate(id)` function to any component in the tree
 * without prop drilling.
 *
 * USAGE
 *   // In any view's JS logic file or JSX component:
 *   import { useNav } from "../context/NavContext";
 *   const navigate = useNav();
 *   navigate("budget");   // switches sidebar to the Budget view
 *
 * VALID IDs
 *   Match the `id` field of each entry in NAV_ITEMS (App.jsx):
 *   "dashboard" | "transactions" | "budget" | "bills" |
 *   "debts"     | "savings"      | "alerts" | "settings"
 *
 * PROVIDER
 *   <NavProvider onNavigate={setActiveId}>
 *     <App />
 *   </NavProvider>
 *   — wrap the shell in App.jsx, passing setActiveId as the handler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createContext, useContext } from "react";

// The context value is the `navigate(id)` function itself.
const NavContext = createContext(() => {
  console.warn("NavContext: navigate called outside of NavProvider");
});

/**
 * Wrap the application shell with this provider.
 * @param {{ onNavigate: (id: string) => void, children: React.ReactNode }} props
 */
export function NavProvider({ onNavigate, children }) {
  return (
    <NavContext.Provider value={onNavigate}>{children}</NavContext.Provider>
  );
}

/**
 * Returns the `navigate(id)` function.
 * Call from any hook or component inside the NavProvider.
 *
 * @returns {(id: string) => void}
 */
export function useNav() {
  return useContext(NavContext);
}
