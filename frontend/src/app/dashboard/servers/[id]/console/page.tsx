"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Terminal,
  Play,
  Square,
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ServerStats {
  memory: { used: number; limit: number; percentage: number };
  cpu: { usage: number; limit: number };
  disk: { used: number; limit: number; percentage: number };
  network: { rx: number; tx: number };
  uptime: number;
  state: string;
}

interface LogEntry {
  line: number;
  content: string;
  timestamp: string;
}

function formatBytes(bytes: number): string {
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
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function logLevelColor(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("error") || lower.includes("fatal") || lower.includes("panic")) return "text-red-400";
  if (lower.includes("warn")) return "text-yellow-400";
  if (lower.includes("info") || lower.includes("started") || lower.includes("listening")) return "text-emerald-400";
  if (lower.includes("debug")) return "text-gray-500";
  return "text-gray-300";
}

export default function ConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: statsData } = useSWR<{ stats: ServerStats }>(
    `/api/v1/servers/${id}/stats`,
    (url: string) => fetchApi<{ stats: ServerStats }>(url),
    { refreshInterval: 5000 }
  );
  const stats = statsData?.stats;

  const { data: logsData, mutate: mutateLogs } = useSWR<{ logs: LogEntry[] }>(
    `/api/v1/servers/${id}/console`,
    (url: string) => fetchApi<{ logs: LogEntry[] }>(url),
    { refreshInterval: 4000 }
  );
  const logs = logsData?.logs || [];

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  function handleLogScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  const isRunning = stats?.state === "running";

  const infoRows = [
    {
      icon: isRunning ? Play : Square,
      label: "State",
      value: stats?.state || "unknown",
      color: isRunning ? "text-emerald-400" : "text-red-400",
      badge: isRunning ? "success" : ("destructive" as const),
    },
    {
      icon: Clock,
      label: "Uptime",
      value: formatUptime(stats?.uptime || 0),
      color: "text-blue-400",
    },
    {
      icon: MemoryStick,
      label: "Memory",
      value: stats ? `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.limit)}` : "--",
      sub: stats ? `${stats.memory.percentage}%` : "",
      color: "text-purple-400",
    },
    {
      icon: Cpu,
      label: "CPU",
      value: stats ? `${stats.cpu.usage}%` : "--",
      sub: stats ? `limit ${stats.cpu.limit}%` : "",
      color: "text-orange-400",
    },
    {
      icon: HardDrive,
      label: "Disk",
      value: stats ? `${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.limit)}` : "--",
      sub: stats ? `${stats.disk.percentage}%` : "",
      color: "text-cyan-400",
    },
  ];

  return (
    <div className="flex flex-col h-[70vh] md:h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            {isRunning ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-400" />
            )}
            <span className="text-muted-foreground">
              {isRunning ? "Running" : "Stopped"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutateLogs()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Info rows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {infoRows.map((row) => (
          <Card key={row.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <row.icon className={`h-5 w-5 ${row.color} flex-shrink-0`} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{row.value}</p>
                  {row.badge && (
                    <Badge variant={row.badge} className="text-[10px] px-1.5 py-0">
                      {row.value}
                    </Badge>
                  )}
                </div>
                {row.sub && (
                  <p className="text-[11px] text-muted-foreground">{row.sub}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Log output */}
      <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Logs ({logs.length} lines)
          </span>
          {!autoScroll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setAutoScroll(true);
                logEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Scroll to bottom
            </Button>
          )}
        </div>
        <div
          className="flex-1 overflow-auto bg-[#0a0a0a] p-3 font-mono text-[13px] leading-5 min-h-0"
          onScroll={handleLogScroll}
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              {isRunning ? "Waiting for logs..." : "Server is not running"}
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.line} className="flex gap-3 hover:bg-white/5 px-1 rounded">
                <span className="text-gray-600 select-none w-8 text-right flex-shrink-0">
                  {log.line}
                </span>
                <span className={logLevelColor(log.content)}>
                  {log.content}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </Card>
    </div>
  );
}
