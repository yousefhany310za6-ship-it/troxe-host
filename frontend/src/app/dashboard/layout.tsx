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
      <div className="p-6 border-b border-border flex items-center justify-between">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="text-xl font-bold text-brand-400"
        >
          Troxe Host
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-600/10 text-brand-400"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
        {user?.isAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Admin
              </p>
            </div>
            {adminNavigation.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-600/10 text-brand-400"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 text-sm font-medium shrink-0">
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.username}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Logout
        </button>
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[80%] bg-card flex flex-col">
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setSidebarOpen(false)}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-10 flex items-center gap-3 p-4 border-b border-border bg-background">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-bold text-brand-400">Troxe Host</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
