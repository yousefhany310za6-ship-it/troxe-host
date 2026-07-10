"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Terminal, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LogEntry {
  line: number;
  content: string;
  timestamp: string;
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

  return (
    <div className="flex flex-col h-[70vh] md:h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{logs.length} lines</span>
          <Button variant="outline" size="sm" onClick={() => mutateLogs()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-auto bg-[#0a0a0a] p-3 font-mono text-[13px] leading-5 min-h-0" onScroll={handleLogScroll}>
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Waiting for logs...
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
