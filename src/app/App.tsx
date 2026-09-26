import { useEffect, useState, createContext, useContext } from "react";
import {
  NavLink,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Send,
  Megaphone,
  Users,
  ContactRound,
  ShieldCheck,
  History,
  ChartNoAxesCombined,
  Wallet,
  CreditCard,
  ReceiptText,
  FileText,
  Code2,
  Webhook,
  Settings,
  ChevronDown,
  ArrowUpRight,
  MessageSquare,
  Menu,
  Bell,
  LogOut,
  LifeBuoy,
  PanelLeftClose,
} from "lucide-react";
import { api, supabase } from "../lib/api";
import { Loading, ErrorBox } from "../components/ui";
import { AuthPage, Onboarding } from "../features/auth";
import {
  Dashboard,
  WalletPage,
  DeveloperPage,
  SettingsPage,
} from "../features/overview";
import { ResourcePage, resourceConfigs } from "../features/resources";
import { Composer } from "../features/composer";
import { Platform } from "../features/platform";
const SessionContext = createContext<any>(null);
export const useWorkspace = () => useContext(SessionContext);
const navGroups = [
  {
    name: "WORKSPACE",
    items: [
      ["", "Dashboard", LayoutDashboard],
      ["send", "Send SMS", Send],
      ["campaigns", "Campaigns", Megaphone],
      ["contacts", "Contacts", Users],
      ["groups", "Groups", ContactRound],
      ["sender-ids", "Sender IDs", ShieldCheck],
    ],
  },
  {
    name: "INSIGHTS & BILLING",
    items: [
      ["messages", "Message history", History],
      ["reports", "Delivery reports", ChartNoAxesCombined],
      ["wallet", "SMS wallet", Wallet],
      ["buy", "Buy SMS", CreditCard],
      ["transactions", "Transactions", ReceiptText],
    ],
  },
  {
    name: "MANAGE",
    items: [
      ["templates", "Templates", FileText],
      ["developers", "API & developers", Code2],
      ["webhooks", "Webhooks", Webhook],
      ["team", "Team", Users],
      ["settings", "Settings", Settings],
    ],
  },
];
export function App() {
  const location = useLocation();
  const client = useQueryClient();
  const [authReady, setAuthReady] = useState(!supabase);
  const [loggedIn, setLoggedIn] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(Boolean(data.session));
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
      client.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  const authRoute = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ].includes(location.pathname);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api("session"),
    enabled: authReady && loggedIn && !authRoute,
  });
  if (import.meta.env.PROD && !supabase)
    return <div className="standalone"><h1>Service setup incomplete</h1><p>Gramvista SMS is not configured for this website yet.</p></div>;
  if (authRoute) return <AuthPage />;
  if (!authReady) return <Loading />;
  if (!loggedIn) return <Navigate to="/login" replace />;
  if (location.pathname.startsWith("/platform")) return <Platform />;
  if (session.isLoading) return <Loading />;
  if (session.error)
    return (
      <div className="standalone">
        <ErrorBox error={session.error} />
        <button className="button" onClick={() => session.refetch()}>
          Try again
        </button>
      </div>
    );
  if(location.pathname==='/onboarding')return session.data?.organization?<Navigate to="/" replace/>:<Onboarding/>;
  if (!session.data?.organization && session.data?.identity.admin)
    return <Navigate to="/platform" replace />;
  if (!session.data?.organization) return <Onboarding />;
  return (
    <SessionContext.Provider value={session.data}>
      <Shell />
    </SessionContext.Provider>
  );
}
function Shell() {
  const session = useWorkspace();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const notices = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("notifications"),
  });
  const name = session.organization.name;
  return (
    <div className="app-shell">
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <aside className={"sidebar " + (open ? "open" : "")}>
        <Link to="/" className="brand">
          <span className="brand-mark">
            <MessageSquare size={22} />
          </span>
          <span>
            gramvista <b>SMS</b>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="org-avatar">{name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>Business workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.name}>
              <div className="nav-label">{group.name}</div>
              {group.items.map(([path, label, Icon]: any) => (
                <NavLink
                  end
                  to={"/" + path}
                  key={path}
                  className={({ isActive }) =>
                    isActive ? "nav-item active" : "nav-item"
                  }
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {path === "send" && <span className="nav-plus">+</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <LifeBuoy size={19} />
            <strong>A little help goes a long way.</strong>
            <Link to="/developers">
              Explore the documentation <ArrowUpRight size={14} />
            </Link>
          </div>
          <small>GRAMVISTA EMPIRE GROUP LIMITED</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <PanelLeftClose className="desktop-only" size={19} />
            <span className="topbar-divider" />
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {location.pathname === "/"
                ? "Overview"
                : location.pathname.slice(1).replaceAll("-", " ")}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={"environment " + (session.demo ? "demo" : "")}>
              <span />
              {session.demo ? "Mock environment" : "Connected"}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              {notices.data?.data.length > 0 && <i />}
            </button>
            <span className="topbar-divider" />
            <span className="user-avatar">{name[0]}</span>
            <div className="user-meta">
              <strong>{name}</strong>
              <small>{session.identity.role}</small>
            </div>
            {supabase && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() => supabase?.auth.signOut()}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
          {notifications && (
            <div className="notification-popover">
              <h3>Notifications</h3>
              {notices.data?.data.length ? (
                notices.data.data.slice(0, 8).map((n: any) => (
                  <div key={n.id}>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                  </div>
                ))
              ) : (
                <p>You’re all caught up.</p>
              )}
            </div>
          )}
        </header>
        <main>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="send" element={<Composer />} />
            <Route path="campaigns/new" element={<Composer campaign />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="buy" element={<WalletPage buy />} />
            <Route path="developers" element={<DeveloperPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="reports"
              element={
                <ResourcePage config={resourceConfigs.messages} reports />
              }
            />
            {Object.entries(resourceConfigs).map(([path, config]) => (
              <Route
                key={path}
                path={path}
                element={<ResourcePage key={path} config={config} />}
              />
            ))}
            <Route
              path="*"
              element={
                <div>
                  <h1>Page not found</h1>
                  <Link to="/">Back to dashboard</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer>
          <span>© {new Date().getFullYear()} Gramvista SMS</span>
          <div>
            <span className="tiny-dot" />
            {session.demo
              ? "Development simulator active"
              : "Business Messaging Infrastructure"}
            <Link to="/developers">API documentation</Link>
            {(session.demo || session.identity.admin) && (
              <Link to="/platform">
                Platform admin <ArrowUpRight size={12} />
              </Link>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
