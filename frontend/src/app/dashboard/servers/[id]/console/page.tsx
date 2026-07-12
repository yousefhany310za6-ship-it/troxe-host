"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  Terminal,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Wifi,
  WifiOff,
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

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export default function ConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const [autoScroll, setAutoScroll] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [commandInput, setCommandInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<ServerEvent[]>([]);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/servers/${id}/console/ws`;

    setConnectionStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionStatus("connected");
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output" && typeof msg.data === "string") {
          const newLog: LogEntry = {
            line: Date.now(),
            content: msg.data,
            timestamp: new Date().toISOString(),
          };
          setLogs((prev) => [...prev, newLog]);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      wsRef.current = null;
      setConnectionStatus("disconnected");
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectWs();
        }
      }, 3000);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, handling happens there
    };
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    connectWs();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWs]);

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

  function sendCommand(e: React.FormEvent) {
    e.preventDefault();
    const cmd = commandInput.trim();
    if (!cmd || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({ type: "command", data: cmd }));

    const cmdLog: LogEntry = {
      line: Date.now(),
      content: `> ${cmd}`,
      timestamp: new Date().toISOString(),
    };
    setLogs((prev) => [...prev, cmdLog]);

    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setCommandInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setCommandInput(commandHistory[newIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setCommandInput("");
      } else {
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[newIndex]);
      }
    }
  }

  const statusConfig: Record<ConnectionStatus, { color: string; label: string; Icon: typeof Wifi }> = {
    connecting: { color: "text-yellow-400", label: "Connecting...", Icon: Wifi },
    connected: { color: "text-emerald-400", label: "Connected", Icon: Wifi },
    disconnected: { color: "text-red-400", label: "Disconnected", Icon: WifiOff },
  };

  const status = statusConfig[connectionStatus];

  return (
    <div className="flex flex-col h-[70vh] md:h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <status.Icon className={`h-3.5 w-3.5 ${status.color}`} />
            <span className={`text-xs font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {entries.length} entries
          </span>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div
          className="flex-1 overflow-auto bg-[#0a0a0a] p-3 font-mono text-[13px] leading-5 min-h-0"
          onScroll={handleLogScroll}
        >
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              {connectionStatus === "connected"
                ? "Waiting for logs..."
                : connectionStatus === "connecting"
                  ? "Connecting to console..."
                  : "Disconnected. Reconnecting..."}
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

        <form
          onSubmit={sendCommand}
          className="flex items-center gap-2 border-t border-white/10 bg-[#0a0a0a] px-3 py-2"
        >
          <span className="text-emerald-400 font-mono text-[13px] select-none">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connectionStatus === "connected"
                ? "Type a command..."
                : "Waiting for connection..."
            }
            disabled={connectionStatus !== "connected"}
            className="flex-1 bg-transparent font-mono text-[13px] text-gray-200 placeholder:text-gray-600 outline-none disabled:opacity-50"
            autoFocus
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={connectionStatus !== "connected" || !commandInput.trim()}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
