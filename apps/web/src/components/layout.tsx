import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Server,
  Settings,
  Sun,
  TerminalSquare,
  X,
} from "lucide-react";
import { apiClient } from "../services/api-client";
import { GlobalSearchModal } from "./modals";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Tasks", to: "/tasks", icon: ListChecks },
  { label: "Agent Runs", to: "/runs", icon: TerminalSquare },
  { label: "Providers", to: "/providers", icon: Server },
  { label: "Settings", to: "/settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const queryClient = useQueryClient();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiClient.getHealth(),
    refetchInterval: 10000,
  });

  const { data: metricsData } = useQuery({
    queryKey: ["metrics", "global"],
    queryFn: () => apiClient.getMetrics(),
    refetchInterval: 3000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
  });

  const currentTheme = settingsData?.data.settings.theme ?? "dark";

  useEffect(() => {
    const rootEl = document.documentElement;
    if (currentTheme === "light") {
      rootEl.classList.remove("dark");
      rootEl.classList.add("light");
    } else {
      rootEl.classList.remove("light");
      rootEl.classList.add("dark");
    }
  }, [currentTheme]);

  const themeMutation = useMutation({
    mutationFn: (nextTheme: "dark" | "light") =>
      apiClient.updateSettings({ theme: nextTheme }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const activeRunsCount = metricsData?.data.activeRuns ?? 0;
  const verifiedLocalCount =
    healthData?.executionModeSummary.verifiedLocalProviders ?? 0;

  const getBreadcrumbs = (): Array<{ label: string; to?: string }> => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return [{ label: "Overview" }];
    const items: Array<{ label: string; to?: string }> = [
      { label: "Workspace", to: "/" },
    ];
    if (parts[0] === "projects") {
      items.push({ label: "Projects", to: parts.length > 1 ? "/projects" : undefined });
      if (parts[1]) items.push({ label: parts[1] });
    } else if (parts[0] === "tasks") {
      items.push({ label: "Tasks", to: parts.length > 1 ? "/tasks" : undefined });
      if (parts[1]) items.push({ label: parts[1] });
    } else if (parts[0] === "runs") {
      items.push({ label: "Agent Runs", to: parts.length > 1 ? "/runs" : undefined });
      if (parts[1]) items.push({ label: parts[1] });
    } else if (parts[0] === "providers") {
      items.push({ label: "Providers" });
    } else if (parts[0] === "settings") {
      items.push({ label: "Settings" });
    } else {
      items.push({ label: parts.join(" / ") });
    }
    return items;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-zinc-800/80 bg-zinc-900/95 transition-all duration-200 lg:static ${
          sidebarCollapsed ? "lg:w-16" : "lg:w-64"
        } ${
          mobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-zinc-800/80 px-4">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <TerminalSquare className="w-4 h-4" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <span className="block text-sm font-bold tracking-tight text-zinc-100 truncate">
                  AgentDesk
                </span>
                <span className="block text-[10px] font-medium text-zinc-400 truncate">
                  Local Agent Workspace
                </span>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden rounded-lg p-1 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 p-2.5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/30"
                      : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 border border-transparent"
                  }`
                }
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </div>
                {!sidebarCollapsed && item.to === "/runs" && activeRunsCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    {activeRunsCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* System & Execution Mode Indicator */}
        <div className="border-t border-zinc-800/80 p-3 space-y-2">
          {!sidebarCollapsed ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-400">
                  Runtime Status
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Local SQLite
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                {verifiedLocalCount > 0 ? (
                  <>
                    <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">
                      Demo + {verifiedLocalCount} Verified CLI
                    </span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">Demo Simulator Ready</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              title="Local SQLite Connected"
              className="flex justify-center py-1 text-emerald-400"
            >
              <Activity className="w-4 h-4" />
            </div>
          )}

          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/50 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-zinc-800/80 bg-zinc-900/85 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:text-zinc-200"
            >
              <Menu className="w-4 h-4" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-zinc-600">/</span>}
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="text-zinc-400 hover:text-zinc-200 transition-colors truncate"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-zinc-100 truncate">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Global Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search workspace"
              className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search workspace...</span>
              <kbd className="hidden md:inline-block rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                Ctrl K
              </kbd>
            </button>

            {/* Execution Mode Indicator Pill */}
            <Link
              to="/providers"
              className={`hidden md:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                verifiedLocalCount > 0
                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              }`}
              title="Click to manage agent providers"
            >
              {verifiedLocalCount > 0 ? (
                <>
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Local CLI + Demo</span>
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5 text-amber-400" />
                  <span>Demo Mode</span>
                </>
              )}
            </Link>

            {/* Refresh Action */}
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries()}
              title="Refresh workspace data"
              aria-label="Refresh workspace data"
              className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-1.5 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() =>
                themeMutation.mutate(currentTheme === "dark" ? "light" : "dark")
              }
              title={`Switch to ${currentTheme === "dark" ? "light" : "dark"} theme`}
              aria-label="Toggle color theme"
              className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-1.5 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
            >
              {currentTheme === "dark" ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
