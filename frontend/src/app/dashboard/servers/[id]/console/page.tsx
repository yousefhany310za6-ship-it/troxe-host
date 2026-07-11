"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Terminal,
  RefreshCw,
  Play,
  Square,
  RotateCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LogEntry {
  line: number;
  content: string;
  timestamp: string;
}

interface ServerEvent {
  type: "start" | "stop" | "restart";
  timestamp: string;
}

interface ConsoleEntry {
  id: string;
  type: "log" | "event";
  content: string;
  timestamp: string;
  eventType?: "start" | "stop" | "restart";
  lineNumber?: number;
}

function logLevelColor(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("error") || lower.includes("fatal") || lower.includes("panic")) return "text-red-400";
  if (lower.includes("warn")) return "text-yellow-400";
  if (lower.includes("info") || lower.includes("started") || lower.includes("listening")) return "text-emerald-400";
  if (lower.includes("debug")) return "text-gray-500";
  return "text-gray-300";
}

const eventConfig = {
  start: {
    icon: Play,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    label: "Server Started",
  },
  stop: {
    icon: Square,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    label: "Server Stopped",
  },
  restart: {
    icon: RotateCw,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    label: "Server Restarted",
  },
};

export default function ConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: consoleData, mutate: mutateLogs } = useSWR<{
    logs: LogEntry[];
    events: ServerEvent[];
  }>(
    `/api/v1/servers/${id}/console`,
    (url: string) => fetchApi<{ logs: LogEntry[]; events: ServerEvent[] }>(url),
    { refreshInterval: 4000 }
  );

  const logs = consoleData?.logs || [];
  const events = consoleData?.events || [];

  // Merge events and logs into a single timeline
  const entries: ConsoleEntry[] = [];

  for (const ev of events) {
    const cfg = eventConfig[ev.type];
    entries.push({
      id: `event-${ev.type}-${ev.timestamp}`,
      type: "event",
      content: cfg.label,
      timestamp: ev.timestamp,
      eventType: ev.type,
    });
  }

  for (const log of logs) {
    entries.push({
      id: `log-${log.line}`,
      type: "log",
      content: log.content,
      timestamp: log.timestamp,
      lineNumber: log.line,
    });
  }

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, autoScroll]);

  function handleLogScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  return (
    <div className="flex flex-col h-[70vh] md:h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {logs.length} logs · {events.length} events
          </span>
          <Button variant="outline" size="sm" onClick={() => mutateLogs()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div
          className="flex-1 overflow-auto bg-[#0a0a0a] p-3 font-mono text-[13px] leading-5 min-h-0"
          onScroll={handleLogScroll}
        >
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Waiting for logs...
            </div>
          ) : (
            entries.map((entry) => {
              if (entry.type === "event") {
                const cfg = eventConfig[entry.eventType!];
                const Icon = cfg.icon;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-2 my-1 px-3 py-1.5 rounded border ${cfg.bg}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${cfg.color} flex-shrink-0`} />
                    <span className={`text-xs font-semibold ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-[11px] text-gray-500 ml-auto">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={entry.id}
                  className="flex gap-3 hover:bg-white/5 px-1 rounded"
                >
                  <span className="text-gray-600 select-none w-8 text-right flex-shrink-0">
                    {entry.lineNumber}
                  </span>
                  <span className={logLevelColor(entry.content)}>
                    {entry.content}
                  </span>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </Card>
    </div>
  );
}
