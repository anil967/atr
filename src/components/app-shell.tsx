import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Users,
  LogOut,
  Bell,
  UserCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from "lucide-react";
import { useThemeStore } from "@/lib/theme-store";
import { useState, type ReactNode } from "react";
import { getHomeRouteForRole, logout, useCurrentUser } from "@/lib/auth-store";
import { ROLE_LABELS } from "@/lib/atr-types";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Workspace", icon: LayoutDashboard },
  { to: "/atrs", label: "My ATRs", icon: FileText },
  { to: "/atrs/new", label: "Create ATR", icon: PlusCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/team", label: "My mentee", icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  if (!user) return null;
  const homeRoute = getHomeRouteForRole(user.role);
  const navItems: NavItem[] = [
    { to: homeRoute, label: `${ROLE_LABELS[user.role]} Home`, icon: LayoutDashboard },
    ...(user.role === "admin"
      ? [{ to: "/user-management", label: "User Management", icon: Users }]
      : []),
    ...(user.role === "chief_mentor"
      ? [{ to: "/approvals", label: "Approvals", icon: UserCheck }]
      : []),
    ...NAV.slice(1)
      .map(item => {
        // For Chief Proctor, rename "My ATRs" to "ATRs"
        if (user.role === "chief_mentor" && item.to === "/atrs") {
          return { ...item, label: "ATRs" };
        }
        return item;
      })
      .filter((item) => {
        // "My mentee" is mentor-only (student roster / Excel import).
        if (item.to === "/team") return user.role === "mentor";
        return true;
      }),
  ];
  const showCreateAtr = user.role === "mentor";
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside
        className={`hidden md:flex shrink-0 border-r border-border bg-sidebar flex-col p-4 sticky top-0 h-dvh transition-all duration-200 ${
          sidebarCollapsed ? "w-20" : "w-72"
        }`}
      >
        <div className={`mb-8 flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
          <Link to={homeRoute} className="flex items-center gap-3 min-w-0">
            <img
              src="/bcet-logo.jpg"
              alt="BCET logo"
              className="size-10 rounded-md object-cover shrink-0 border border-border/60 bg-white"
            />
            {!sidebarCollapsed ? (
              <div>
                <h1 className="text-lg font-semibold leading-none">BCET</h1>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1.5">
                  ATR Portal
                </p>
              </div>
            ) : null}
          </Link>
          {!sidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          ) : null}
        </div>

        {sidebarCollapsed ? (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="mb-6 mx-auto size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        ) : null}

        <nav className="flex-1 space-y-1">
          {navItems
            .filter((item) => (item.to === "/atrs/new" ? showCreateAtr : true))
            .map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-secondary text-growth"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {!sidebarCollapsed ? label : null}
              </Link>
            );
          })}
        </nav>

        <div
          className={`mt-6 rounded-2xl bg-growth text-growth-foreground shadow-architectural relative overflow-hidden ${
            sidebarCollapsed ? "p-3" : "p-5"
          }`}
        >
          {!sidebarCollapsed ? (
            <>
              <p className="text-xs text-growth-foreground/70 mb-1">Academic Year</p>
              <p className="font-medium">2024 — 2025</p>
            </>
          ) : (
            <p className="text-[10px] text-center text-growth-foreground/80">2024-25</p>
          )}
          {showCreateAtr ? (
            <Link
              to="/atrs/new"
              className={`mt-4 inline-flex w-full items-center justify-center gap-2 py-2 bg-surface text-growth text-sm font-semibold rounded-lg hover:bg-surface/90 transition-colors ${
                sidebarCollapsed ? "px-0" : ""
              }`}
            >
              <PlusCircle className="size-4" />
              {!sidebarCollapsed ? "New ATR" : null}
            </Link>
          ) : null}
        </div>

        <div
          className={`mt-6 pt-6 border-t border-border flex items-center gap-3 ${
            sidebarCollapsed ? "justify-center" : ""
          }`}
        >
          <div className="size-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-growth">
            {initials}
          </div>
          {!sidebarCollapsed ? (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {ROLE_LABELS[user.role]} · {user.department}
              </p>
            </div>
          ) : null}
          <button
            onClick={useThemeStore.getState().toggleTheme}
            className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Toggle theme"
          >
            {useThemeStore((s) => s.theme) === "light" ? (
              <Moon className="size-4" />
            ) : (
              <Sun className="size-4" />
            )}
          </button>
          <button
            onClick={handleLogout}
            className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden h-14 border-b border-border bg-surface flex items-center justify-between px-4">
          <Link to={homeRoute} className="flex items-center gap-2">
            <img
              src="/bcet-logo.jpg"
              alt="BCET logo"
              className="size-7 rounded-sm object-cover border border-border/60 bg-white"
            />
            <span className="font-semibold text-sm">BCET ATR</span>
          </Link>
          <button onClick={handleLogout} className="text-xs text-muted-foreground">
            Sign out
          </button>
        </header>
        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
}
