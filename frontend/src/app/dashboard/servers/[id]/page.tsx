"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Play,
  Square,
  RotateCw,
  Cpu,
  HardDrive,
  MemoryStick,
  Globe,
  Wifi,
  WifiOff,
  Clock,
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
  publicIp: string;
  memoryLimit: number;
  memoryUsed: number;
  cpuLimit: number;
  cpuUsed: number;
  diskLimit: number;
  diskUsed: number;
}

interface ServerStats {
  memory: { used: number; limit: number; percentage: number };
  cpu: { usage: number; limit: number };
  disk: { used: number; limit: number; percentage: number };
  network: { rx: number; tx: number };
  uptime: number;
  state: string;
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

function formatBytesRaw(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "--";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

export default function ServerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [powerLoading, setPowerLoading] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<{ server: ServerDetail }>(
    `/api/v1/servers/${id}`,
    (url: string) => fetchApi<{ server: ServerDetail }>(url)
  );
  const server = data?.server;

  const { data: statsData } = useSWR<{ stats: ServerStats }>(
    `/api/v1/servers/${id}/stats`,
    (url: string) => fetchApi<{ stats: ServerStats }>(url),
    { refreshInterval: 5000 }
  );
  const stats = statsData?.stats;

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

  const isRunning = (stats?.state || server.status) === "running";
  const effectiveStatus = (stats?.state || server.status) as ServerDetail["status"];

  const statusInfo = [
    {
      icon: isRunning ? Wifi : WifiOff,
      label: "State",
      value: stats?.state || server.status,
      color: isRunning ? "text-emerald-400" : "text-red-400",
    },
    {
      icon: Clock,
      label: "Uptime",
      value: formatUptime(stats?.uptime || 0),
      color: "text-blue-400",
    },
    {
      icon: Globe,
      label: "Address",
      value: server.publicIp ? `${server.publicIp}:${server.port}` : `${server.ip}:${server.port}`,
      href: server.publicIp ? `http://${server.publicIp}:${server.port}` : undefined,
      color: "text-gray-400",
    },
  ];

  const liveMemUsed = stats?.memory.used || server.memoryUsed * 1024 * 1024;
  const liveMemLimit = stats?.memory.limit || server.memoryLimit * 1024 * 1024;
  const liveMemPct = stats?.memory.percentage || Math.min((server.memoryUsed / server.memoryLimit) * 100, 100);

  const liveCpuUsage = stats?.cpu.usage || server.cpuUsed;
  const liveCpuLimit = stats?.cpu.limit || server.cpuLimit;
  const liveCpuPct = Math.min((liveCpuUsage / liveCpuLimit) * 100, 100);

  const liveDiskUsed = stats?.disk.used || server.diskUsed * 1024 * 1024;
  const liveDiskLimit = stats?.disk.limit || server.diskLimit * 1024 * 1024;
  const liveDiskPct = stats?.disk.percentage || Math.min((server.diskUsed / server.diskLimit) * 100, 100);

  const resourceCards = [
    {
      label: "Memory",
      icon: MemoryStick,
      used: formatBytesRaw(liveMemUsed),
      total: formatBytesRaw(liveMemLimit),
      percent: liveMemPct,
    },
    {
      label: "CPU",
      icon: Cpu,
      used: `${liveCpuUsage.toFixed(2)}%`,
      total: `${liveCpuLimit}%`,
      percent: liveCpuPct,
    },
    {
      label: "Disk",
      icon: HardDrive,
      used: formatBytesRaw(liveDiskUsed),
      total: formatBytesRaw(liveDiskLimit),
      percent: liveDiskPct,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{server.name}</h1>
            <p className="text-sm text-muted-foreground">
              {server.publicIp ? `${server.publicIp}:${server.port}` : `${server.ip}:${server.port}`}
            </p>
          </div>
          <Badge variant={statusVariant[effectiveStatus]} className="text-sm">
            {effectiveStatus}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => powerAction("start")}
            disabled={powerLoading !== null || effectiveStatus === "running"}
          >
            <Play className="h-4 w-4 mr-1.5" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => powerAction("stop")}
            disabled={powerLoading !== null || effectiveStatus === "stopped"}
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {statusInfo.map((info) => (
          <div
            key={info.label}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <info.icon className={`h-5 w-5 flex-shrink-0 ${info.color}`} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{info.label}</p>
              {"href" in info && info.href ? (
                <a
                  href={info.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold truncate text-blue-400 hover:underline"
                >
                  {info.value}
                </a>
              ) : (
                <p className="text-sm font-semibold truncate">{info.value}</p>
              )}
            </div>
          </div>
        ))}
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
    </div>
  );
}
