"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { Server as ServerIcon, Plus, Cpu, HardDrive, MemoryStick, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Server {
  id: string;
  name: string;
  nodeId: string;
  status: "running" | "stopped" | "installing";
  memoryLimit: number;
  memoryUsed: number;
  diskLimit: number;
  diskUsed: number;
  owner: string;
  ip: string;
  port: number;
}

const statusVariant: Record<Server["status"], "success" | "destructive" | "warning"> = {
  running: "success",
  stopped: "destructive",
  installing: "warning",
};

function formatBytes(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export default function ServersPage() {
  const { data, error, isLoading } = useSWR<{ servers: Server[] }>(
    "/api/v1/servers",
    (url: string) => fetchApi<{ servers: Server[] }>(url)
  );
  const servers = data?.servers;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="text-muted-foreground">Manage your game server instances</p>
        </div>
        <Link href="/dashboard/servers/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Server
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-5 bg-secondary rounded w-1/3" />
                <div className="h-4 bg-secondary rounded w-1/2" />
                <div className="h-4 bg-secondary rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load servers. Please try again.</p>
          </CardContent>
        </Card>
      ) : servers && servers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <Link key={server.id} href={`/dashboard/servers/${server.id}`}>
              <Card className="hover:border-brand-500/50 transition-colors cursor-pointer">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <ServerIcon className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold">{server.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Node: {server.nodeId}
                      </p>
                    </div>
                    <Badge variant={statusVariant[server.status]}>
                      {server.status}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MemoryStick className="h-3.5 w-3.5" />
                        Memory
                      </div>
                      <span>{formatBytes(server.memoryUsed)} / {formatBytes(server.memoryLimit)}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${Math.min((server.memoryUsed / server.memoryLimit) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <HardDrive className="h-3.5 w-3.5" />
                        Disk
                      </div>
                      <span>{formatBytes(server.diskUsed)} / {formatBytes(server.diskLimit)}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${Math.min((server.diskUsed / server.diskLimit) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground pt-2 border-t border-border">
                    <User className="h-3.5 w-3.5" />
                    {server.owner}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <ServerIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No servers yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first game server to get started.
            </p>
            <Link href="/dashboard/servers/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Server
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
