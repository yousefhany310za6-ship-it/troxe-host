"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

export default function ConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [serverName, setServerName] = useState("Console");
  const [commandInput, setCommandInput] = useState("");

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (term: Terminal, fitAddon: FitAddon) => {
      cleanup();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/v1/servers/${id}/console/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        term.focus();
        fitAddon.fit();
      };

      ws.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : String(event.data);
        term.write(data);
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(() => {
          connect(term, fitAddon);
        }, 3000);
      };
    },
    [id, cleanup]
  );

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      theme: {
        background: "#0a0a0a",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#0a0a0a",
        selectionBackground: "#264f78",
        black: "#0a0a0a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#d4d4d4",
        brightBlack: "#6b7280",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde68a",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f5f5f5",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    termInstance.current = term;
    fitAddonRef.current = fitAddon;

    fitAddon.fit();

    const onDataDisposable = term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    const onResizeDisposable = term.onResize(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          wsRef.current.send(
            JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
          );
        }
      }
    });

    connect(term, fitAddon);

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    fetch(`/api/v1/servers/${id}`)
      .then((r) => r.json())
      .then((data: { name?: string }) => {
        if (data.name) setServerName(data.name);
      })
      .catch(() => {});

    return () => {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      window.removeEventListener("resize", handleResize);
      cleanup();
      term.dispose();
      termInstance.current = null;
      fitAddonRef.current = null;
    };
  }, [id, connect, cleanup]);

  function handleSendCommand() {
    if (!commandInput.trim()) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(commandInput + "\n");
    }
    if (termInstance.current) {
      termInstance.current.focus();
    }
    setCommandInput("");
  }

  return (
    <div className="flex flex-col h-[70vh] md:h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TerminalIcon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{serverName}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-emerald-500" : "bg-destructive"
            }`}
          />
          <span className="text-muted-foreground">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div ref={terminalRef} className="flex-1 bg-[#0a0a0a] p-2 min-h-0" />
        <div className="p-3 border-t border-border bg-card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCommand();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Send command..."
              className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={!connected}
            />
            <Button type="submit" size="default" disabled={!connected || !commandInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
