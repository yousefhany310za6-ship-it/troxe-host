"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Play,
  Square,
  RotateCw,
  Terminal,
  Folder,
  Database,
  Clock,
  Users,
  Settings,
  Cpu,
  HardDrive,
  MemoryStick,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ServerDetail {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "installing";
  nodeId: string;
  ip: string;
  port: number;
  memoryLimit: number;
  memoryUsed: number;
  cpuLimit: number;
  cpuUsed: number;
  diskLimit: number;
  diskUsed: number;
}

const statusVariant: Record<ServerDetail["status"], "success" | "destructive" | "warning"> = {
  running: "success",
  stopped: "destructive",
  starting: "warning",
  installing: "warning",
};

function formatBytes(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

const tabs = [
  { name: "Overview", href: "", icon: Globe },
  { name: "Console", href: "console", icon: Terminal },
  { name: "Files", href: "files", icon: Folder },
  { name: "Backups", href: "backups", icon: Database },
  { name: "Schedules", href: "schedules", icon: Clock },
  { name: "Subusers", href: "subusers", icon: Users },
  { name: "Settings", href: "settings", icon: Settings },
];

export default function ServerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const pathname = usePathname();
  const [powerLoading, setPowerLoading] = useState<string | null>(null);

  const { data: server, error, isLoading } = useSWR<ServerDetail>(
    `/api/v1/servers/${id}`,
    (url: string) => fetchApi<ServerDetail>(url)
  );

  const activeTab = pathname === `/dashboard/servers/${id}`
    ? ""
    : pathname.replace(`/dashboard/servers/${id}/`, "");

  async function powerAction(action: "start" | "stop" | "restart") {
    setPowerLoading(action);
    try {
      await fetchApi(`/api/v1/servers/${id}/power`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
    } catch {
    } finally {
      setTimeout(() => setPowerLoading(null), 1000);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-secondary rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-secondary rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load server details.</p>
        </CardContent>
      </Card>
    );
  }

  const resourceCards = [
    {
      label: "Memory",
      icon: MemoryStick,
      used: formatBytes(server.memoryUsed),
      total: formatBytes(server.memoryLimit),
      percent: Math.min((server.memoryUsed / server.memoryLimit) * 100, 100),
    },
    {
      label: "CPU",
      icon: Cpu,
      used: `${server.cpuUsed}%`,
      total: `${server.cpuLimit}%`,
      percent: Math.min((server.cpuUsed / server.cpuLimit) * 100, 100),
    },
    {
      label: "Disk",
      icon: HardDrive,
      used: formatBytes(server.diskUsed),
      total: formatBytes(server.diskLimit),
      percent: Math.min((server.diskUsed / server.diskLimit) * 100, 100),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{server.name}</h1>
            <p className="text-sm text-muted-foreground">
              {server.ip}:{server.port}
            </p>
          </div>
          <Badge variant={statusVariant[server.status]} className="text-sm">
            {server.status}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => powerAction("start")}
            disabled={powerLoading !== null || server.status === "running"}
          >
            <Play className="h-4 w-4 mr-1.5" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => powerAction("stop")}
            disabled={powerLoading !== null || server.status === "stopped"}
          >
            <Square className="h-4 w-4 mr-1.5" />
            Stop
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => powerAction("restart")}
            disabled={powerLoading !== null}
          >
            <RotateCw className={cn("h-4 w-4 mr-1.5", powerLoading === "restart" && "animate-spin")} />
            Restart
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {resourceCards.map((r) => (
          <Card key={r.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {r.label}
              </CardTitle>
              <r.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{r.used}</div>
              <p className="text-xs text-muted-foreground">of {r.total}</p>
              <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${r.percent}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <nav className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.href;
          return (
            <Link
              key={tab.name}
              href={`/dashboard/servers/${id}${tab.href ? `/${tab.href}` : ""}`}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
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
      </nav>

      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Select a tab to view details.
        </CardContent>
      </Card>
    </div>
  );
}
