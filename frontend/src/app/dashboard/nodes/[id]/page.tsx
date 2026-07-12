"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Network,
  Server as ServerIcon,
  MemoryStick,
  HardDrive,
  MapPin,
  Wifi,
  WifiOff,
  Wrench,
  Globe,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NodeDetail {
  id: string;
  name: string;
  fqdn: string;
  public_ip: string;
  private_ip: string | null;
  location_name: string | null;
  location_id: string;
  status: string;
  maintenance_mode: boolean;
  total_memory_mb: number;
  allocated_memory_mb: number;
  total_disk_mb: number;
  allocated_disk_mb: number;
  daemon_listen_port: number;
  sftp_port: number;
  last_heartbeat_at: string | null;
  created_at: string;
}

interface Server {
  id: string;
  name: string;
  status: string;
  owner_id: string;
}

interface Allocation {
  id: string;
  ip: string;
  port: number;
  server_id: string | null;
}

interface NodeStats {
  stats: {
    memory: { total: number; allocated: number; percentage: number };
    disk: { total: number; allocated: number; percentage: number };
    servers: { total: number; running: number };
  };
}

function formatMb(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

const serverStatusVariant: Record<
  string,
  "success" | "destructive" | "warning" | "secondary"
> = {
  running: "success",
  stopped: "destructive",
  crashed: "destructive",
  starting: "warning",
  installing: "warning",
  install_pending: "warning",
};

export default function NodeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{
    node: NodeDetail;
    servers: Server[];
    allocations: Allocation[];
  }>(`/api/v1/nodes/${id}`, (url) =>
    fetchApi<{ node: NodeDetail; servers: Server[]; allocations: Allocation[] }>(url)
  );

  const { data: statsData } = useSWR<NodeStats>(
    `/api/v1/nodes/${id}/stats`,
    (url) => fetchApi<NodeStats>(url)
  );

  const node = data?.node;
  const servers = data?.servers ?? [];
  const allocations = data?.allocations ?? [];
  const stats = statsData?.stats;

  async function toggleMaintenance() {
    if (!node) return;
    setMaintenanceLoading(true);
    try {
      await fetchApi(`/api/v1/nodes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ maintenanceMode: !node.maintenance_mode }),
      });
      mutate();
    } catch (err: any) {
      alert(err.message || "Failed to update maintenance mode");
    } finally {
      setMaintenanceLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-secondary rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

  if (error || !node) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load node details.</p>
        </CardContent>
      </Card>
    );
  }

  const status = node.maintenance_mode ? "maintenance" : node.status;
  const memPercent = stats?.memory.percentage ?? (node.total_memory_mb > 0 ? Math.round((node.allocated_memory_mb / node.total_memory_mb) * 100) : 0);
  const diskPercent = stats?.disk.percentage ?? (node.total_disk_mb > 0 ? Math.round((node.allocated_disk_mb / node.total_disk_mb) * 100) : 0);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/dashboard/nodes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Nodes
        </Link>

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Network className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold">{node.name}</h1>
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {node.fqdn}
            </p>
          </div>
          <Badge
            variant={
              status === "online"
                ? "success"
                : status === "maintenance"
                ? "warning"
                : "destructive"
            }
            className="text-sm gap-1.5"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status === "online"
                  ? "bg-emerald-500"
                  : status === "maintenance"
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            />
            {status}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={node.maintenance_mode ? "default" : "outline"}
            onClick={toggleMaintenance}
            disabled={maintenanceLoading}
          >
            <Wrench
              className={cn(
                "h-4 w-4 mr-1.5",
                maintenanceLoading && "animate-spin"
              )}
            />
            {node.maintenance_mode ? "Disable Maintenance" : "Enable Maintenance"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Location</p>
            <p className="text-sm font-semibold truncate">
              {node.location_name || "Unknown"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Public IP</p>
            <p className="text-sm font-semibold truncate">{node.public_ip}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <ServerIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Servers</p>
            <p className="text-sm font-semibold">
              {stats?.servers.total ?? servers.length} total,{" "}
              {stats?.servers.running ?? servers.filter((s) => s.status === "running").length} running
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          {node.last_heartbeat_at ? (
            <Wifi className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-400 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Last Heartbeat</p>
            <p className="text-sm font-semibold truncate">
              {node.last_heartbeat_at
                ? new Date(node.last_heartbeat_at).toLocaleString()
                : "Never"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Memory
            </CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMb(node.allocated_memory_mb)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {formatMb(node.total_memory_mb)}
            </p>
            <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  memPercent > 90 ? "bg-red-500" : memPercent > 70 ? "bg-yellow-500" : "bg-brand-500"
                )}
                style={{ width: `${Math.min(memPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{memPercent}% allocated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Disk
            </CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMb(node.allocated_disk_mb)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {formatMb(node.total_disk_mb)}
            </p>
            <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  diskPercent > 90 ? "bg-red-500" : diskPercent > 70 ? "bg-yellow-500" : "bg-brand-500"
                )}
                style={{ width: `${Math.min(diskPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{diskPercent}% allocated</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Servers</h2>
        {servers.length > 0 ? (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-right px-6 py-3 font-medium text-muted-foreground">
                      ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((srv) => (
                    <tr
                      key={srv.id}
                      className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="px-6 py-3 font-medium">
                        <Link
                          href={`/dashboard/servers/${srv.id}`}
                          className="text-brand-400 hover:underline"
                        >
                          {srv.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={serverStatusVariant[srv.status] ?? "secondary"}>
                          {srv.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-muted-foreground">
                        {srv.id.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No servers on this node.
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Allocations</h2>
        {allocations.length > 0 ? (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                      IP Address
                    </th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                      Port
                    </th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                      Assigned To
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((alloc) => (
                    <tr
                      key={alloc.id}
                      className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono">{alloc.ip}</td>
                      <td className="px-6 py-3 font-mono">{alloc.port}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {alloc.server_id
                          ? servers.find((s) => s.id === alloc.server_id)?.name ||
                            alloc.server_id.slice(0, 8)
                          : "Unassigned"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No allocations configured for this node.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
