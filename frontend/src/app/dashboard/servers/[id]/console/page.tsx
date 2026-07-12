"use client";

import { useState, useCallback } from "react";
import {
  Terminal,
  RefreshCw,
  Trash2,
  Copy,
  Download,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Terminal as UseTerminal, TerminalContainer } from "@/components/terminal";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export default function ConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  const {
    status,
    clearTerminal,
    copySelection,
    downloadLogs,
    reconnect,
    containerRef,
  } = UseTerminal({
    serverId: id,
    serverStatus: "running",
    onStatusChange: setConnectionStatus,
  });

  const statusConfig: Record<ConnectionStatus, { color: string; label: string; Icon: typeof Wifi }> = {
    connecting: { color: "text-yellow-400", label: "Connecting...", Icon: Wifi },
    connected: { color: "text-emerald-400", label: "Connected", Icon: Wifi },
    disconnected: { color: "text-red-400", label: "Disconnected", Icon: WifiOff },
  };

  const statusInfo = statusConfig[connectionStatus];

  return (
    <div className="flex flex-col h-[70vh] md:h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <statusInfo.Icon className={`h-3.5 w-3.5 ${statusInfo.color}`} />
            <span className={`text-xs font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>

          {connectionStatus === "disconnected" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reconnect}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Reconnect
            </Button>
          )}

          <div className="flex items-center gap-1 border-l border-white/10 pl-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTerminal}
              title="Clear terminal"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 p-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copySelection}
              title="Copy selection"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 p-0"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadLogs}
              title="Download logs"
              className="text-gray-400 hover:text-gray-200 h-8 w-8 p-0"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden min-h-0 p-0">
        <TerminalContainer containerRef={containerRef} />
      </Card>
    </div>
  );
}
