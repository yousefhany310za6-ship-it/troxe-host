"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Globe,
  Terminal,
  Folder,
  Database,
  Clock,
  Users,
  Settings,
} from "lucide-react";

const tabs = [
  { name: "Overview", href: "", icon: Globe },
  { name: "Console", href: "console", icon: Terminal },
  { name: "Files", href: "files", icon: Folder },
  { name: "Backups", href: "backups", icon: Database },
  { name: "Schedules", href: "schedules", icon: Clock },
  { name: "Subusers", href: "subusers", icon: Users },
  { name: "Settings", href: "settings", icon: Settings },
];

export default function ServerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const { id } = params;
  const pathname = usePathname();

  const basePath = `/dashboard/servers/${id}`;
  const currentPath = pathname.replace(basePath, "").replace(/^\//, "");
  const activeTab = currentPath;

  return (
    <div className="space-y-0">
      <nav className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.href;
            return (
              <Link
                key={tab.name}
                href={`${basePath}${tab.href ? `/${tab.href}` : ""}`}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                  isActive
                    ? "border-brand-500 text-brand-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.name}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="pt-4">{children}</div>
    </div>
  );
}
