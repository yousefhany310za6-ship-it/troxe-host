"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface TerminalProps {
  serverId: string;
  serverStatus: string;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export function Terminal({ serverId, serverStatus, onStatusChange }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const connectWs = useCallback(() => {
    if (!mountedRef.current || !termRef.current) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/servers/${serverId}/console/ws`;

    updateStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      updateStatus("connected");
      termRef.current?.focus();
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current || !termRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output" && typeof msg.data === "string") {
          termRef.current.write(msg.data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      wsRef.current = null;
      updateStatus("disconnected");
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectWs();
        }
      }, 3000);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [serverId, updateStatus]);

  useEffect(() => {
    if (!containerRef.current) return;

    mountedRef.current = true;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: "#0a0a0a",
        foreground: "#d4d4d8",
        cursor: "#22d3ee",
        cursorAccent: "#0a0a0a",
        selectionBackground: "#22d3ee33",
        selectionForeground: "#ffffff",
        black: "#18181b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#d4d4d8",
        brightBlack: "#71717a",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // Try loading WebGL addon
    import("@xterm/addon-webgl").then(({ WebglAddon }) => {
      if (!mountedRef.current) return;
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        term.loadAddon(webglAddon);
      } catch {
        // WebGL not available, fall back to canvas
      }
    }).catch(() => {
      // Module not available, fall back to canvas
    });

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle terminal input -> send to WebSocket
    const inputDisposable = term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "command", data }));
      }
    });

    // Handle terminal resize -> notify WebSocket
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });
    resizeObserver.observe(containerRef.current);

    connectWs();

    return () => {
      mountedRef.current = false;
      inputDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [serverId, connectWs]);

  const clearTerminal = useCallback(() => {
    termRef.current?.clear();
  }, []);

  const copySelection = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  }, []);

  const downloadLogs = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const buffer = term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      lines.push(buffer.getLine(i)?.translateToString(true) || "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `console-${serverId}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [serverId]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        connectWs();
      }
    }, 100);
  }, [connectWs]);

  return {
    status,
    clearTerminal,
    copySelection,
    downloadLogs,
    reconnect,
    containerRef,
  };
}

export function TerminalContainer({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={containerRef}
      className="terminal-container w-full h-full bg-[#0a0a0a] overflow-hidden"
    />
  );
}
