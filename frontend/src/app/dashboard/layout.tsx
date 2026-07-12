"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Server,
  Network,
  Users,
  MapPin,
  Egg,
  FolderTree,
  Settings,
  LogOut,
  Menu,
  X,
  Activity,
  ListTodo,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import ThemeToggle from "@/components/theme-toggle";

const userNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Servers", href: "/dashboard/servers", icon: Server },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

const adminNavigation = [
  { name: "Nodes", href: "/dashboard/nodes", icon: Network },
  { name: "Users", href: "/dashboard/users", icon: Users },
  { name: "Locations", href: "/dashboard/locations", icon: MapPin },
  { name: "Nests", href: "/dashboard/nests", icon: FolderTree },
  { name: "Eggs", href: "/dashboard/eggs", icon: Egg },
  { name: "Database Hosts", href: "/dashboard/database-hosts", icon: Database },
  { name: "Activity", href: "/dashboard/activity", icon: Activity },
  { name: "Jobs", href: "/dashboard/jobs", icon: ListTodo },
];

function SidebarContent({
  pathname,
  onNavigate,
  onClose,
}: {
  pathname: string;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  return (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-white/[0.06] flex items-center justify-between">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="text-xl font-bold text-gradient-brand"
        >
          Troxe Host
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {userNavigation.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-brand-600/20 to-purple-600/10 text-brand-400 shadow-glow-brand border border-brand-500/20"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground hover:border-white/[0.06] border border-transparent"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive ? "text-brand-400" : ""
                )}
              />
              {item.name}
            </Link>
          );
        })}

        {user?.isAdmin && (
          <>
            <div className="pt-4 pb-2 px-3.5">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Admin
                </p>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
            </div>
            {adminNavigation.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-brand-600/20 to-purple-600/10 text-brand-400 shadow-glow-brand border border-brand-500/20"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground hover:border-white/[0.06] border border-transparent"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-colors",
                      isActive ? "text-brand-400" : ""
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-white/[0.06] space-y-3">
        {/* User profile */}
        <div className="glass-card rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold shrink-0 shadow-glow-brand">
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.username}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
        </div>

        {/* Theme + Logout row */}
        <div className="flex items-center justify-between px-1">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-all duration-200"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, initialized, checkAuth, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (initialized && !user) {
      router.push("/auth/login");
    }
  }, [initialized, user, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center bg-mesh">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex relative">
      {/* Background */}
      <div className="fixed inset-0 bg-mesh pointer-events-none" />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-white/[0.06] bg-background/80 backdrop-blur-xl flex-col relative z-10">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[80%] bg-background/95 backdrop-blur-xl border-r border-white/[0.06] flex flex-col">
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setSidebarOpen(false)}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden relative z-10">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-10 flex items-center gap-3 p-4 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-bold text-gradient-brand">Troxe Host</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
